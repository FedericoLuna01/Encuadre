import { chromium } from "playwright"
import { createServer } from "node:http"
import { readFile, writeFile, mkdtemp, cp, rm } from "node:fs/promises"
import { resolve, join, dirname, basename } from "node:path"
import { tmpdir } from "node:os"
import assert from "node:assert/strict"
import { waitUntil } from "./helpers.mjs"

const server = createServer((req, res) => {
  res.setHeader("Content-Type", "text/html;charset=utf-8")
  res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:white}main{height:2200px;background:#edf3f0}footer{height:100px;background:rgb(200,30,40)}#resolution{position:fixed;left:120px;top:220px;width:64px;height:24px;background:repeating-linear-gradient(to right,#000 0px,#000 1px,#fff 1px,#fff 2px);z-index:99}</style><main><input aria-label="Nombre"><div id="resolution"></div></main><footer>Fin</footer>')
})
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const temp = await mkdtemp(join(tmpdir(), "encuadre-quality-"))
let context
try {
  const extension = join(temp, "extension")
  await cp(resolve("dist"), extension, { recursive: true })
  const manifest = JSON.parse(await readFile(join(extension, "manifest.json"), "utf8"))
  manifest.host_permissions = ["<all_urls>"]
  await writeFile(join(extension, "manifest.json"), JSON.stringify(manifest))
  context = await chromium.launchPersistentContext(join(temp, "profile"), { locale: "es-AR", channel: "chromium", headless: true, args: ["--lang=es", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--window-size=1440,1100"], viewport: null })
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker")
  const id = new URL(worker.url()).host
  await worker.evaluate(() => {
    globalThis.captureChecks = []
    const send = chrome.debugger.sendCommand.bind(chrome.debugger)
    chrome.debugger.sendCommand = async (target, method, params) => {
      if (method === "Page.captureScreenshot") {
        while (globalThis.pauseCapture) await new Promise(resolve => setTimeout(resolve, 30))
        const source = await chrome.tabs.get(target.tabId)
        const [active] = await chrome.tabs.query({ active: true, windowId: source.windowId })
        globalThis.captureChecks.push(!source.active && active?.url?.includes("result.html"))
      }
      return send(target, method, params)
    }
  })
  const source = await context.newPage(); await source.goto(origin)
  const panel = await context.newPage(); await panel.goto(`chrome-extension://${id}/index.html`)
  await panel.waitForFunction(() => document.querySelector(".control-sheet")?.getAttribute("aria-busy") === "false")
  const tabId = await worker.evaluate(async origin => (await chrome.tabs.query({})).find(tab => tab.url === `${origin}/`).id, origin)
  const send = async message => {
    const reply = await panel.evaluate(message => chrome.runtime.sendMessage(message), message)
    assert.equal(reply.ok, true, JSON.stringify(reply)); return reply.state
  }
  await send({ type: "target", tabId })
  await send({ type: "apply", profile: { id: "iphone-14-pro", name: "iPhone 14 Pro", width: 393, height: 852, kind: "phone" }, scale: .5 })
  const controls = source.frames().find(frame => frame.name() === "encuadre-controls")
  const site = source.frames().find(frame => frame.name() === "encuadre-site")
  await site.getByRole("textbox").fill("Conservar ñ")
  await site.evaluate(() => scrollTo({ top: 300, behavior: "instant" }))
  for (const density of [2, 3]) {
    await source.bringToFront()
    await send({ type: "emulation", settings: { density, userAgent: "", touch: true } })
    await site.waitForFunction(density => devicePixelRatio === density, density)
    await worker.evaluate(() => { globalThis.pauseCapture = true })
    const next = context.waitForEvent("page")
    await send({ type: "capture", kind: "visible" })
    const result = await next
    await result.getByRole("button", { name: "Cancelar captura", exact: true }).waitFor()
    await worker.evaluate(() => { globalThis.pauseCapture = false })
    await result.getByRole("radio", { name: "Solo página", exact: true }).click()
    await result.waitForFunction(() => document.querySelector(".captured-image")?.complete && !document.querySelector(".download-primary")?.disabled)
    const pixels = await result.locator(".captured-image").evaluate(async (image, density) => {
      await image.decode()
      const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
      const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0)
      return { width: canvas.width, height: canvas.height, body: [...ctx.getImageData(10, 100, 1, 1).data], stripe: [...ctx.getImageData(122 * density, 225 * density, 60 * density, 1).data].filter((_, index) => index % 4 === 0) }
    }, density)
    assert.deepEqual([pixels.width, pixels.height], [393 * density, 759 * density])
    assert.deepEqual(pixels.body, [237, 243, 240, 255], "the capture contains the mobile document")
    assert.ok(pixels.stripe.includes(0) && pixels.stripe.includes(255) && pixels.stripe.every(value => value === 0 || value === 255), `${density}× export must contain sharp native pixels`)
    const pageCount = context.pages().length
    await waitUntil(async () => (await send({ type: "state" })).stage === "done")
    await send({ type: "show-result" })
    assert.equal(context.pages().length, pageCount, "reopening an early result keeps its existing tab")
    await result.close()
    await waitUntil(async () => !(await send({ type: "state" })).resultId)
    assert.equal(await site.getByRole("textbox").inputValue(), "Conservar ñ")
    assert.equal(await site.evaluate(() => scrollY), 300)
    assert.equal(await controls.evaluate(() => document.documentElement.classList.contains("inline-snapshot")), false)
    await source.bringToFront()
    await site.waitForFunction(density => devicePixelRatio === density, density)
    console.log(`PASS: ${density}× native sharp pixels, preserved document and scroll, restored preview`)
  }
  const checks = await worker.evaluate(() => globalThis.captureChecks)
  assert.ok(checks.length >= 2 && checks.every(Boolean), "capture runs behind the result tab so the phone never visibly jumps")
  await source.bringToFront()
  await send({ type: "emulation", settings: { density: 2, userAgent: "", touch: true } })
  let next = context.waitForEvent("page")
  await send({ type: "capture", kind: "full" })
  let result = await next
  await result.locator(".captured-image").waitFor()
  const full = await result.locator(".captured-image").evaluate(async image => {
    await image.decode()
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0)
    return { width: canvas.width, height: canvas.height, bottom: [...ctx.getImageData(20, canvas.height - 20, 1, 1).data] }
  })
  assert.deepEqual(full, { width: 786, height: 4600, bottom: [200, 30, 40, 255] })
  await result.close(); await waitUntil(async () => !(await send({ type: "state" })).resultId)
  assert.equal(await site.evaluate(() => scrollY), 300)
  console.log("PASS: complete mobile page at 2× includes the footer and restores scroll")

  await source.bringToFront()
  next = context.waitForEvent("page")
  await send({ type: "capture", kind: "full" })
  result = await next
  await result.getByRole("button", { name: "Cancelar captura", exact: true }).click()
  await waitUntil(async () => (await send({ type: "state" })).stage === "cancelled")
  assert.equal(await controls.evaluate(() => document.documentElement.classList.contains("inline-snapshot")), false)
  assert.equal(await site.evaluate(() => scrollY), 300)
  await result.close()
  console.log("PASS: cancellation from the result restores the framed emulator")

  await source.bringToFront()
  next = context.waitForEvent("page")
  await send({ type: "capture", kind: "full" })
  result = await next
  await result.getByRole("button", { name: "Cancelar captura", exact: true }).waitFor()
  await result.close()
  await waitUntil(async () => (await send({ type: "state" })).stage === "cancelled")
  assert.equal(await controls.evaluate(() => document.documentElement.classList.contains("inline-snapshot")), false)
  console.log("PASS: closing the pending result cancels capture and restores the emulator")

  await source.bringToFront()
  await send({ type: "apply", profile: { id: "pixel-8", name: "Google Pixel 8", width: 915, height: 412, kind: "phone" }, scale: .5 })
  await site.evaluate(() => { const stripe = document.createElement("div"); stripe.style.cssText = "position:fixed;left:0;top:100px;width:100vw;height:100px;background:linear-gradient(to right,red 0%,red 50%,blue 50%,blue 100%);z-index:999"; document.body.append(stripe) })
  next = context.waitForEvent("page")
  await send({ type: "capture", kind: "visible" })
  result = await next
  await result.getByRole("radio", { name: "Solo página", exact: true }).click()
  const wide = await result.locator(".captured-image").evaluate(async image => {
    await image.decode()
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0)
    return { width: canvas.width, height: canvas.height, left: [...ctx.getImageData(20, 300, 1, 1).data], right: [...ctx.getImageData(canvas.width - 20, 300, 1, 1).data] }
  })
  assert.deepEqual(wide, { width: 1830, height: 728, left: [255, 0, 0, 255], right: [0, 0, 255, 255] })
  await result.close()
  console.log("PASS: landscape capture includes content wider than the browser")
} finally {
  await context?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  assert.equal(dirname(temp), resolve(tmpdir())); assert.ok(basename(temp).startsWith("encuadre-quality-"))
  await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
