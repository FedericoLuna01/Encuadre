import { chromium } from "playwright"
import { createServer } from "node:http"
import { readFile, writeFile, mkdir, mkdtemp, rm, cp } from "node:fs/promises"
import { resolve, join, basename, dirname } from "node:path"
import { tmpdir } from "node:os"
import { PNG } from "pngjs"
import assert from "node:assert/strict"
import { waitUntil } from "./helpers.mjs"

let lastAgent = ""
const fixture = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pruebas P1</title><style>body{margin:0;background:#fff}header{height:40px;background:#20a040}main{height:1400px}button,input{margin:12px;font:16px sans-serif}footer{height:100px;background:#2040e0}</style><header>Menú del día</header><main><input aria-label="Nombre"><button onclick="this.textContent='Listo'">Probar toque</button><p>Datos privados: 12345678</p></main><footer>Final</footer>`
const server = createServer((req, res) => {
  lastAgent = req.headers["user-agent"]
  res.setHeader("Content-Type", "text/html;charset=utf-8")
  res.end(fixture)
})
await new Promise(resolve => server.listen(0, resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const temp = await mkdtemp(join(tmpdir(), "encuadre-p1-"))
let context
try {
  const extension = join(temp, "extension")
  await cp(resolve("dist"), extension, { recursive: true })
  const manifest = JSON.parse(await readFile(join(extension, "manifest.json"), "utf8"))
  manifest.host_permissions = ["<all_urls>"] // Automation cannot supply the activeTab gesture.
  await writeFile(join(extension, "manifest.json"), JSON.stringify(manifest))
  const background = join(extension, "background.js")
  await writeFile(background, `globalThis.debugConnections = 0;
    const attach = chrome.debugger.attach.bind(chrome.debugger), detach = chrome.debugger.detach.bind(chrome.debugger);
    chrome.debugger.attach = async (...args) => { await attach(...args); globalThis.debugConnections++; };
    chrome.debugger.detach = async (...args) => { await detach(...args); globalThis.debugConnections--; };
  ` + await readFile(background, "utf8"))
  context = await chromium.launchPersistentContext(join(temp, "profile"), { locale: "es-AR", channel: "chromium", headless: true, viewport: null, acceptDownloads: true, args: ["--lang=es", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--window-size=1440,1000"] })
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker")
  const id = new URL(worker.url()).host
  const source = await context.newPage(); await source.goto(origin)
  const tabId = await worker.evaluate(async origin => (await chrome.tabs.query({})).find(tab => tab.url === `${origin}/`).id, origin)
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/index.html`); await popup.waitForFunction(() => document.querySelector(".control-sheet")?.getAttribute("aria-busy") === "false")
  const send = async message => { const reply = await popup.evaluate(message => chrome.runtime.sendMessage(message), message); assert.equal(reply.ok, true, JSON.stringify(reply)); return reply.state }
  await send({ type: "target", tabId })
  assert.equal(await worker.evaluate(() => globalThis.debugConnections), 0, "basic startup does not attach a debugger")
  const capture = async kind => {
    await source.bringToFront()
    await send({ type: "capture", kind })
    const state = await waitUntil(async () => { const state = await send({ type: "state" }); return ["done", "error", "cancelled"].includes(state.stage) && state }, 60000)
    assert.equal(state.stage, "done", state.error)
    const page = await waitUntil(() => context.pages().find(page => page.url().includes(`id=${state.resultId}`)))
    await waitUntil(async () => page.locator(".captured-image").evaluate(image => image.decode().then(() => image.naturalWidth > 0).catch(() => false)).catch(() => false))
    return page
  }
  const pixels = page => page.locator(".captured-image").evaluate(image => {
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    const context = canvas.getContext("2d"); context.drawImage(image, 0, 0)
    return { width: canvas.width, height: canvas.height, bottom: [...context.getImageData(canvas.width - 10, canvas.height - 10, 1, 1).data] }
  })
  let result = await capture("visible")
  // Exercise the actual editor and exported bytes, including opaque masks and history.
  await result.getByRole("button", { name: "1:1", exact: true }).click()
  await result.getByRole("button", { name: "Editar captura", exact: true }).click()
  const surface = result.getByRole("application", { name: "Lienzo de edición" })
  await waitUntil(async () => (await surface.getAttribute("aria-busy")) === "false")
  const drag = async (x1, y1, x2, y2) => {
    const box = await surface.boundingBox()
    await result.mouse.move(box.x + x1, box.y + y1); await result.mouse.down(); await result.mouse.move(box.x + x2, box.y + y2); await result.mouse.up()
    await waitUntil(async () => (await surface.getAttribute("aria-busy")) === "false")
  }
  await drag(20, 60, 160, 120)
  const downloaded = async format => {
    if (format !== "PNG") { await result.getByRole("button", { name: "Más opciones de descarga" }).click(); const promise = result.waitForEvent("download"); await result.getByRole("menuitem", { name: `Descargar ${format}`, exact: true }).click(); return promise }
    const promise = result.waitForEvent("download"); await result.getByRole("button", { name: "Descargar PNG", exact: true }).click(); return promise
  }
  const download = await downloaded("PNG"), path = await download.path(), png = PNG.sync.read(await readFile(path))
  const at = (png.width * 80 + 80) * 4
  assert.deepEqual([...png.data.subarray(at, at + 4)], [0, 0, 0, 255], "redaction replaces pixels with opaque black")
  await result.evaluate(() => {
    globalThis.savedCanvasToBlob = HTMLCanvasElement.prototype.toBlob
    HTMLCanvasElement.prototype.toBlob = callback => callback(null)
  })
  await drag(200, 60, 260, 120)
  await result.getByText("No se pudo generar la imagen editada.", { exact: true }).waitFor()
  assert.equal(await result.getByRole("button", { name: "Descargar PNG", exact: true }).isDisabled(), true)
  assert.equal(await result.getByRole("button", { name: "Copiar imagen", exact: true }).isDisabled(), true)
  assert.equal(await result.getByRole("button", { name: "Imprimir", exact: true }).isDisabled(), true)
  await result.evaluate(() => { HTMLCanvasElement.prototype.toBlob = globalThis.savedCanvasToBlob })
  await result.getByRole("button", { name: "Deshacer", exact: true }).click()
  await waitUntil(async () => (await surface.getAttribute("aria-busy")) === "false")
  await result.getByRole("button", { name: "Deshacer", exact: true }).click()
  await waitUntil(async () => (await surface.getAttribute("aria-busy")) === "false")
  assert.equal(await result.getByRole("button", { name: "Rehacer", exact: true }).isEnabled(), true)
  await result.getByRole("button", { name: "Rehacer", exact: true }).click()
  await waitUntil(async () => (await surface.getAttribute("aria-busy")) === "false")
  for (const tool of ["Flecha", "Rectángulo", "Resaltar"]) { await result.getByLabel(tool, { exact: true }).click(); await drag(30, 160, 200, 210) }
  await result.getByLabel("Texto", { exact: true }).click()
  let box = await surface.boundingBox(); await result.mouse.click(box.x + 20, box.y + 240)
  await result.getByLabel("Texto a colocar").fill("Revisar menú ñ")
  await result.getByLabel("Texto a colocar").press("Enter")
  await waitUntil(async () => (await surface.getAttribute("aria-busy")) === "false")
  await result.getByLabel("Recortar", { exact: true }).click(); await drag(10, 10, 300, 350)
  await result.getByRole("button", { name: "Ver resultado", exact: true }).click()
  await result.locator(".captured-image").evaluate(image => image.decode())
  await waitUntil(async () => (await pixels(result)).width === 290)
  assert.equal((await pixels(result)).width, 290)
  assert.equal((await pixels(result)).height, 340)
  await downloaded("JPG"); await downloaded("PDF")
  await waitUntil(() => result.getByRole("button", { name: "Editar captura", exact: true }).isEnabled())
  await result.getByRole("button", { name: "Editar captura", exact: true }).click()
  for (const width of [1440, 768, 390]) {
    await result.setViewportSize({ width, height: 1000 })
    await result.screenshot({ path: `test-results/p1-editor-${width}.png`, fullPage: true })
  }
  await result.setViewportSize({ width: 1440, height: 1000 })
  await result.getByRole("button", { name: "Ver resultado", exact: true }).click()
  await mkdir("test-results", { recursive: true }); await result.screenshot({ path: "test-results/p1-edited.png" })
  console.log("PASS: opaque flattened PNG, editor tools, undo/redo, crop, JPG and PDF exports")
  // setViewportSize installs Playwright's own device-metrics override on the
  // editor. Close that test page before exercising the extension's emulator.
  await result.close()

  await source.bringToFront()
  const profile = { id: "iphone-13", name: "iPhone 13", width: 390, height: 844, kind: "phone" }
  await send({ type: "apply", profile, scale: "fit" })
  const site = source.frames().find(frame => frame.name() === "encuadre-site")
  const controls = source.frames().find(frame => frame.name() === "encuadre-controls")
  assert.ok(site && controls)
  await waitUntil(() => site.evaluate(() => devicePixelRatio === 2))
  assert.deepEqual(await site.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio, touch: navigator.maxTouchPoints, coarse: matchMedia("(pointer:coarse)").matches, mobile: /iPhone/.test(navigator.userAgent) })), { width: 390, dpr: 2, touch: 5, coarse: true, mobile: true })
  assert.match(lastAgent, /iPhone/)
  const touchButton = site.getByRole("button", { name: "Probar toque" })
  // Even a site's inline !important cursor must yield to the touch indicator.
  await touchButton.evaluate(button => button.style.setProperty("cursor", "pointer", "important"))
  const cursor = () => touchButton.evaluate(button => getComputedStyle(button).cursor)
  assert.match(await cursor(), /data:image\/svg\+xml.*16 16/, "touch mode uses a centered circular cursor")
  assert.doesNotMatch(await controls.getByRole("button").first().evaluate(button => getComputedStyle(button).cursor), /data:image/, "extension controls keep their normal cursor")
  await send({ type: "emulation", settings: { density: 2, userAgent: "", touch: false } })
  assert.equal(await cursor(), "pointer", "disabling touch restores the site's cursor")
  await send({ type: "emulation", settings: { density: 2, userAgent: "", touch: true } })
  assert.match(await cursor(), /data:image\/svg\+xml.*16 16/, "reenabling touch restores the indicator")
  await site.evaluate(() => { globalThis.touchCount = 0; document.addEventListener("touchstart", event => { if (event.isTrusted) globalThis.touchCount++ }) })
  console.log("Emulator metrics and mobile request verified; testing real mouse-to-touch")
  await site.getByRole("button", { name: "Probar toque" }).click({ timeout: 5000 })
  await site.getByRole("button", { name: "Listo" }).waitFor()
  assert.ok(await site.evaluate(() => globalThis.touchCount > 0), "mouse input becomes a real trusted touch")
  const phoneBox = await controls.locator('iframe[name="encuadre-site"]').boundingBox()
  await source.mouse.move(phoneBox.x + phoneBox.width * .7, phoneBox.y + phoneBox.height * .7)
  await source.mouse.down()
  await source.mouse.move(phoneBox.x + phoneBox.width * .7, phoneBox.y + phoneBox.height * .3, { steps: 10 })
  await source.mouse.up()
  await waitUntil(() => site.evaluate(() => scrollY > 20))
  await site.getByLabel("Nombre").fill("Estado preservado ñ")
  await send({ type: "emulation", settings: { density: 3, userAgent: "Encuadre-Mobile-Test", touch: true } })
  let mobileProperties
  await waitUntil(async () => {
    mobileProperties = await site.evaluate(() => ({ density: devicePixelRatio, agent: navigator.userAgent }))
    return mobileProperties.density === 3 && mobileProperties.agent === "Encuadre-Mobile-Test"
  }).catch(error => { console.log("Mobile properties did not settle:", mobileProperties); throw error })
  assert.equal(await site.getByLabel("Nombre").inputValue(), "Estado preservado ñ")
  await send({ type: "apply", profile: { ...profile, width: profile.height, height: profile.width }, scale: "fit" })
  await waitUntil(() => site.evaluate(() => innerWidth === 844))
  assert.equal(await site.getByLabel("Nombre").inputValue(), "Estado preservado ñ")
  await send({ type: "apply", profile, scale: "fit" })
  result = await capture("visible")
  await result.getByText("Solo página", { exact: true }).click()
  await waitUntil(async () => (await pixels(result)).width === 1170)
  assert.equal((await pixels(result)).height, 2289)
  await source.bringToFront()
  await send({ type: "apply", profile: null, scale: "fit" })
  await waitUntil(() => source.evaluate(() => devicePixelRatio === 1 && !document.getElementById("encuadre-simulator")))
  assert.equal(await worker.evaluate(() => globalThis.debugConnections), 0)
  console.log("PASS: unified framed emulator, real DPR, mobile UA, trusted touch, rotation, state and desktop restoration")

} catch (error) {
  console.error("P1 failed before browser cleanup:", error)
  throw error
} finally {
  await context?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  assert.equal(dirname(resolve(temp)), resolve(tmpdir())); assert.ok(basename(temp).startsWith("encuadre-p1-"))
  await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
