import { chromium } from "playwright"
import { createServer } from "node:http"
import { readFile, writeFile, mkdir, mkdtemp, rm, cp } from "node:fs/promises"
import { resolve, join, basename, dirname } from "node:path"
import { tmpdir } from "node:os"
import assert from "node:assert/strict"
import { PDFDocument, PageSizes } from "pdf-lib"
import { waitUntil } from "./helpers.mjs"

const fixture = await readFile(new URL("./fixture.html", import.meta.url))
const server = createServer((req, res) => {
  if (req.url === "/slow-image") { const timer = setTimeout(() => { res.writeHead(404); res.end() }, 10000); res.on("close", () => clearTimeout(timer)); return }
  res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(fixture)
})
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const userData = await mkdtemp(join(tmpdir(), "encuadre-test-"))
await mkdir("test-results", { recursive: true })
let context
try {
  const extension = join(userData, "extension")
  await cp(resolve("dist"), extension, { recursive: true })
  const manifest = JSON.parse(await readFile(join(extension, "manifest.json"), "utf8"))
  assert.ok(manifest.permissions.includes("debugger"), "framed emulation declares the required debugging permission")
  assert.equal(manifest.host_permissions, undefined, "production access stays scoped to the user action")
  manifest.host_permissions = ["<all_urls>"] // Test copy: automation does not grant activeTab.
  await writeFile(join(extension, "manifest.json"), JSON.stringify(manifest))
  // Observe native menu registration and retain the real click handler for routing tests.
  const backgroundPath = join(extension, "background.js")
  await writeFile(backgroundPath, `
    globalThis.testMenus = [];
    const createMenu = chrome.contextMenus.create.bind(chrome.contextMenus);
    chrome.contextMenus.create = properties => { const id = createMenu(properties); globalThis.testMenus.push(properties); return id; };
    const addMenuListener = chrome.contextMenus.onClicked.addListener.bind(chrome.contextMenus.onClicked);
    chrome.contextMenus.onClicked.addListener = listener => { globalThis.testMenuClick = listener; addMenuListener(listener); };
  ` + await readFile(backgroundPath, "utf8"))
  context = await chromium.launchPersistentContext(join(userData, "profile"), { locale: "es-AR", channel: "chromium", headless: true, args: ["--lang=es", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--window-size=1440,1100"], viewport: null, acceptDownloads: true })
  context.setDefaultTimeout(60000)
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker")
  worker.on("console", message => { if (message.type() === "warning") console.log(message.text()) })
  const id = new URL(worker.url()).host
  await waitUntil(() => worker.evaluate(() => globalThis.testMenus.length === 5))
  const menus = await worker.evaluate(() => globalThis.testMenus)
  assert.equal(menus[0].title, "Encuadre")
  assert.deepEqual(menus.slice(1).map(menu => menu.id), ["capture-full", "capture-visible", "open-phone", "restore-desktop"])
  assert.ok(menus.slice(1).every(menu => menu.parentId === "encuadre"))
  assert.ok(manifest.permissions.includes("contextMenus"))
  let source = await context.newPage()
  await source.goto(origin)
  await source.getByRole("textbox").fill("Formulario preservado ñ")
  let tabId = await worker.evaluate(async origin => (await chrome.tabs.query({})).find(tab => tab.url === `${origin}/`)?.id, origin)
  const panel = await context.newPage()
  await panel.goto(`chrome-extension://${id}/index.html`)
  await panel.waitForSelector(".popup-actions button")
  await panel.waitForFunction(() => document.querySelector(".control-sheet")?.getAttribute("aria-busy") === "false")
  const send = async message => { const reply = await panel.evaluate(message => chrome.runtime.sendMessage(message), message); assert.equal(reply.ok, true, JSON.stringify(reply)); return reply }
  await send({ type: "target", tabId })
  const menuClick = menuItemId => worker.evaluate(async ({ tabId, menuItemId }) => globalThis.testMenuClick({ menuItemId }, await chrome.tabs.get(tabId)), { tabId, menuItemId })
  await source.bringToFront()
  await menuClick("open-phone")
  await waitUntil(async () => (await send({ type: "state" })).state.message === "Celular abierto en esta pestaña")
  assert.equal((await send({ type: "state" })).state.appliedProfile.id, "iphone-13")
  await menuClick("restore-desktop")
  await waitUntil(async () => !(await send({ type: "state" })).state.inline)
  assert.equal(await source.getByRole("textbox").inputValue(), "Formulario preservado ñ")
  console.log("PASS: native context menu registration, default phone and desktop restoration")
  const capture = async kind => {
    const next = context.waitForEvent("page")
    await worker.evaluate(async ({ tabId, kind }) => globalThis.testMenuClick({ menuItemId: `capture-${kind}` }, await chrome.tabs.get(tabId)), { tabId, kind })
    const result = await next
    await result.getByRole("button", { name: /^Descargar (PNG|JPG|PDF)$/ }).waitFor()
    await result.locator(".captured-image").evaluate(image => image.decode())
    return result
  }
  const sample = async result => result.locator(".captured-image").evaluate(image => {
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0)
    const column = ctx.getImageData(canvas.width - 10, 0, 1, canvas.height).data
    let headerRows = 0
    for (let i = 0; i < column.length; i += 4) if (Math.abs(column[i] - 32) <= 2 && Math.abs(column[i + 1] - 38) <= 2 && Math.abs(column[i + 2] - 36) <= 2) headerRows++
    return { width: image.naturalWidth, height: image.naturalHeight, bottom: [...ctx.getImageData(canvas.width - 20, canvas.height - 20, 1, 1).data], headerRows }
  })
  await source.evaluate(() => scrollTo({ top: 450, behavior: "instant" }))
  const viewport = await source.evaluate(() => [innerWidth, innerHeight])
  let result = await capture("visible")
  await panel.bringToFront()
  await panel.reload()
  await panel.getByRole("button", { name: "Ver última captura", exact: true }).waitFor()
  const pageCount = context.pages().length
  await panel.getByRole("button", { name: "Ver última captura", exact: true }).click()
  await waitUntil(() => worker.evaluate(async url => (await chrome.tabs.query({ active: true })).some(tab => tab.url === url), result.url()))
  assert.equal(context.pages().length, pageCount, "opening the latest capture reuses its existing result tab")
  await result.reload()
  await result.locator(".captured-image").evaluate(image => image.decode())
  await panel.bringToFront()
  await panel.getByRole("button", { name: "Ver última captura", exact: true }).click()
  await waitUntil(() => worker.evaluate(async url => (await chrome.tabs.query({ active: true })).some(tab => tab.url === url), result.url()))
  assert.equal(context.pages().length, pageCount, "repeated clicks keep a single result tab")
  const previousResult = result
  await previousResult.goto("about:blank")
  await panel.bringToFront()
  const reopened = context.waitForEvent("page")
  await panel.getByRole("button", { name: "Ver última captura", exact: true }).click()
  result = await reopened
  await result.locator(".captured-image").evaluate(image => image.decode())
  await previousResult.close()
  await result.reload()
  await result.locator(".captured-image").evaluate(image => image.decode())
  console.log("PASS: reopening the latest capture focuses the existing tab and preserves the reloadable result")
  assert.deepEqual(await result.locator(".captured-image").evaluate(image => [image.naturalWidth, image.naturalHeight]), viewport)
  assert.equal(await source.evaluate(() => scrollY), 450)
  assert.equal(await source.getByRole("textbox").inputValue(), "Formulario preservado ñ")
  const downloadPromise = result.waitForEvent("download")
  await result.getByRole("button", { name: "Descargar PNG", exact: true }).click()
  await (await downloadPromise).saveAs(resolve("test-results/native-visible.png"))
  await result.getByRole("button", { name: "Más opciones de descarga" }).click()
  const jpegPromise = result.waitForEvent("download")
  await result.getByRole("menuitem", { name: "Descargar JPG", exact: true }).click()
  await (await jpegPromise).saveAs(resolve("test-results/native-visible.jpg"))
  const jpeg = await readFile("test-results/native-visible.jpg"); assert.equal(jpeg[0], 255); assert.equal(jpeg[1], 216)
  await result.getByRole("button", { name: "Descargar JPG", exact: true }).waitFor()
  await result.getByRole("button", { name: "Más opciones de descarga" }).click()
  const pdfPromise = result.waitForEvent("download")
  await result.getByRole("menuitem", { name: "Descargar PDF", exact: true }).click()
  const pdfDownload = await pdfPromise
  assert.ok(pdfDownload.suggestedFilename().endsWith(".pdf"))
  await pdfDownload.saveAs(resolve("test-results/native-visible.pdf"))
  const pdf = await PDFDocument.load(await readFile("test-results/native-visible.pdf"))
  assert.equal(pdf.getPageCount(), 1)
  assert.deepEqual(pdf.getPage(0).getSize(), { width: PageSizes.A4[0], height: PageSizes.A4[1] })
  await result.getByRole("button", { name: "Descargar PDF", exact: true }).waitFor()
  await result.reload()
  await result.getByRole("button", { name: "Descargar PDF", exact: true }).waitFor()
  // Exercise print preparation without opening the operating system dialog.
  await result.evaluate(() => {
    const append = document.body.append.bind(document.body)
    document.body.append = (...nodes) => {
      append(...nodes)
      for (const node of nodes) if (node instanceof HTMLIFrameElement) node.contentWindow.print = () => {
        globalThis.testPrintPages = node.contentDocument.querySelectorAll("section").length
        node.contentWindow.dispatchEvent(new Event("afterprint"))
      }
    }
  })
  await result.getByRole("button", { name: "Imprimir", exact: true }).click()
  await result.waitForFunction(() => globalThis.testPrintPages > 0)
  assert.equal(await result.evaluate(() => globalThis.testPrintPages), Math.ceil(viewport[1] * 190 / viewport[0] / 277))
  assert.equal(await result.locator('iframe[title="Imprimir captura"]').count(), 0)
  await result.getByRole("button", { name: "Más opciones de descarga" }).click()
  const pngAgain = result.waitForEvent("download")
  await result.getByRole("menuitem", { name: "Descargar PNG", exact: true }).click()
  await pngAgain
  await result.getByRole("button", { name: "Descargar PNG", exact: true }).waitFor()
  await result.getByRole("button", { name: "Más opciones de descarga" }).click()
  await result.screenshot({ path: "test-results/download-options-1440.png" })
  await result.keyboard.press("Escape")
  await result.setViewportSize({ width: 390, height: 844 })
  await result.getByRole("button", { name: "Más opciones de descarga" }).click()
  await result.screenshot({ path: "test-results/download-options-390.png" })
  await result.close()
  console.log("PASS: native pixels, PNG/JPG/PDF downloads, saved format, print pagination and responsive menu")

  await source.bringToFront()
  result = await capture("full")
  const pixels = await sample(result)
  assert.equal(pixels.width, viewport[0]); assert.ok(pixels.height > 3000)
  assert.deepEqual(pixels.bottom, [200, 30, 40, 255])
  assert.ok(pixels.headerRows >= 45 && pixels.headerRows <= 50, "fixed header is not repeated")
  await result.getByRole("button", { name: "Más opciones de descarga" }).click()
  const fullPdfPromise = result.waitForEvent("download")
  await result.getByRole("menuitem", { name: "Descargar PDF", exact: true }).click()
  await (await fullPdfPromise).saveAs(resolve("test-results/native-full.pdf"))
  const fullPdf = await PDFDocument.load(await readFile("test-results/native-full.pdf"))
  const margin = 10 * 72 / 25.4
  assert.equal(fullPdf.getPageCount(), Math.ceil(pixels.height * (PageSizes.A4[0] - 2 * margin) / pixels.width / (PageSizes.A4[1] - 2 * margin)), "long captures paginate onto A4 sheets")
  assert.deepEqual(fullPdf.getPage(0).getSize(), { width: PageSizes.A4[0], height: PageSizes.A4[1] })
  await source.waitForFunction(() => scrollY === 450)
  assert.equal(await source.evaluate(() => [...document.querySelectorAll("style")].some(style => style.textContent.includes("animation-play-state"))), false)
  await result.screenshot({ path: "test-results/native-full-result.png" })
  await result.close()
  console.log("PASS: full-page stitching reaches the footer, keeps one fixed header and restores page styles")

  await source.bringToFront()
  await send({ type: "capture", kind: "full" })
  await waitUntil(async () => (await send({ type: "state" })).state.stage === "scrolling")
  await send({ type: "cancel" })
  await waitUntil(async () => (await send({ type: "state" })).state.stage === "cancelled")
  await source.waitForFunction(() => scrollY === 450)
  console.log("PASS: cancelling restores scroll and releases the capture job")

  const profile = { id: "saved-test", name: "Mi tamaño", width: 430, height: 900, kind: "custom" }
  await worker.evaluate(profile => chrome.storage.local.set({ preferences: { profile, customProfiles: [profile], format: "png", quality: 90, previewScale: .5 } }), profile)
  await send({ type: "apply", profile, scale: .5 })
  const site = source.frames().find(frame => frame.name() === "encuadre-site")
  await site.waitForFunction(() => innerWidth === 430 && innerHeight === 900)
  await site.getByRole("textbox").fill("Dentro del tamaño propio")
  await send({ type: "apply", profile: { ...profile, width: 900, height: 430 }, scale: "fit" })
  await site.waitForFunction(() => innerWidth === 900 && innerHeight === 430)
  assert.equal(await site.getByRole("textbox").inputValue(), "Dentro del tamaño propio")
  await panel.reload(); await panel.waitForFunction(() => document.querySelector(".popup-actions button") && !document.querySelector(".popup-actions button").disabled)
  assert.equal((await worker.evaluate(async () => (await chrome.storage.local.get("preferences")).preferences)).profile.name, "Mi tamaño")
  await send({ type: "apply", profile: null, scale: "fit" })
  assert.equal(await source.getByRole("textbox").inputValue(), "Formulario preservado ñ")
  console.log("PASS: saved custom profiles, CSS viewport changes, rotation and original document restoration")

  const denied = await panel.evaluate(() => chrome.runtime.sendMessage({ type: "target", tabId: -999 }))
  assert.equal(denied.ok, false)
  await send({ type: "target", tabId })
  await source.goto(`${origin}/resources`, { waitUntil: "domcontentloaded" })
  await source.bringToFront()
  await send({ type: "capture", kind: "full" })
  await new Promise(resolve => setTimeout(resolve, 150))
  await source.close()
  await waitUntil(async () => (await send({ type: "state" })).state.stage === "error")
  assert.match((await send({ type: "state" })).state.error, /cerró/)
  source = await context.newPage(); await source.goto(origin)
  tabId = await worker.evaluate(async origin => (await chrome.tabs.query({})).find(tab => tab.url === `${origin}/`)?.id, origin)
  await send({ type: "target", tabId })
  result = await capture("visible"); await result.close()
  console.log("PASS: source-tab closure reports an error and a new capture recovers")

  await source.goto(`${origin}/infinite`)
  await source.bringToFront()
  result = await capture("full")
  await result.getByText("El resultado es parcial", { exact: true }).waitFor()
  const dimensions = await result.locator(".captured-image").evaluate(image => [image.naturalWidth, image.naturalHeight])
  assert.ok(dimensions[1] <= 16000 && dimensions[0] * dimensions[1] <= 24_000_000)
  assert.ok(dimensions[1] > 3000)
  await result.close()
  await waitUntil(async () => !(await send({ type: "state" })).state.resultId)
  console.log("PASS: infinite pages terminate with bounded output; closing the result clears its temporary record")
} catch (error) {
  const worker = context?.serviceWorkers()[0]
  if (worker) console.log("Capture diagnostics:", await worker.evaluate(async () => (await chrome.storage.session.get("state")).state).catch(() => null))
  throw error
} finally {
  await context?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  assert.equal(dirname(resolve(userData)), resolve(tmpdir())); assert.ok(basename(userData).startsWith("encuadre-test-"))
  await rm(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
