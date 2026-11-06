import { chromium } from "playwright"
import { createServer } from "node:http"
import { readFile, mkdtemp, rm, mkdir, cp, writeFile } from "node:fs/promises"
import { resolve, join, dirname, basename } from "node:path"
import { tmpdir } from "node:os"
import assert from "node:assert/strict"
import { gzipSync } from "node:zlib"
import { waitUntil } from "./helpers.mjs"

const fixture = (await readFile(new URL("./fixture.html", import.meta.url), "utf8")).replace("</head>", '<meta name="theme-color" content="#203040"><link rel="manifest" href="/app.webmanifest"></head>')
const server = createServer((req, res) => {
  if (req.url === "/app.webmanifest") { res.setHeader("Content-Type", "application/manifest+json"); res.end(JSON.stringify({ name: "Prueba", start_url: "/", display: "standalone", theme_color: "#203040", background_color: "#f6ead9" })); return }
  res.setHeader("Content-Type", "text/html;charset=utf-8")
  res.setHeader("X-Frame-Options", "DENY")
  res.setHeader("Content-Security-Policy", "frame-src 'none'; frame-ancestors 'none'")
  res.setHeader("Content-Encoding", "gzip")
  res.end(gzipSync(fixture))
})
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const userData = await mkdtemp(join(tmpdir(), "encuadre-inline-"))
await mkdir("test-results", { recursive: true })
let context
try {
  const extension = join(userData, "extension")
  await cp(resolve("dist"), extension, { recursive: true })
  const manifest = JSON.parse(await readFile(join(extension, "manifest.json"), "utf8"))
  assert.ok(manifest.permissions.includes("debugger"), "framed emulation requires an installation-time permission")
  // Automation cannot grant activeTab by opening an extension page. This test
  // copy grants hosts; the production manifest keeps action-scoped activeTab.
  manifest.host_permissions = ["<all_urls>"]
  await writeFile(join(extension, "manifest.json"), JSON.stringify(manifest))
  context = await chromium.launchPersistentContext(join(userData, "profile"), { locale: "es-AR", channel: "chromium", headless: true, args: ["--lang=es", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--window-size=1440,1100"], viewport: null, acceptDownloads: true })
  context.setDefaultTimeout(30000)
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker")
  const id = new URL(worker.url()).host
  const source = await context.newPage()
  await source.goto(origin)
  await source.getByRole("textbox").fill("Estado original ñ")
  const sourceId = await worker.evaluate(async origin => (await chrome.tabs.query({})).find(t => t.url === `${origin}/`)?.id, origin)
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${id}/index.html`)
  await popup.waitForFunction(() => document.querySelector(".control-sheet")?.getAttribute("aria-busy") === "false")
  const send = async message => { const reply = await popup.evaluate(message => chrome.runtime.sendMessage(message), message); assert.equal(reply.ok, true, JSON.stringify(reply)); return reply }
  await send({ type: "target", tabId: sourceId })
  const profile = { id: "iphone-14-pro", name: "iPhone 14 Pro", width: 393, height: 852, kind: "phone" }
  await send({ type: "apply", profile, scale: "fit" })
  const count = context.pages().length
  await send({ type: "simulator" })
  assert.equal(context.pages().length, count, "opening the simulator creates no browser tab")
  assert.equal(source.url(), `${origin}/`, "the original address stays in the address bar")
  await source.waitForFunction(() => document.getElementById("encuadre-simulator"))
  const site = source.frames().find(frame => frame.name() === "encuadre-site")
  const controls = source.frames().find(frame => frame.name() === "encuadre-controls")
  assert.ok(site && controls, "the site and extension controls load in the original tab")
  await source.bringToFront()
  const clickCapture = async label => {
    const button = controls.getByRole("button", { name: label, exact: true })
    await waitUntil(() => button.isEnabled())
    await button.evaluate(button => { setTimeout(() => button.click(), 0) })
  }
  await controls.getByRole("button", { name: "Capturar pantalla", exact: true }).waitFor()
  await send({ type: "inline-refresh" })
  for (const [target, path] of [["_self", "/productos"], ["_top", "/carrito"], ["_parent", "/pedido"], ["_blank", "/cuenta"]]) {
    await site.evaluate(({ target, path }) => {
      const link = document.createElement("a")
      link.id = "navigation-test-link"; link.href = path; link.target = target; link.textContent = "Abrir ruta"
      link.style.cssText = "position:fixed;top:100px;left:20px;z-index:99999;background:white;padding:20px"
      document.body.append(link)
    }, { target, path })
    await site.getByRole("link", { name: "Abrir ruta", exact: true }).click()
    await site.waitForURL(`${origin}${path}`, { timeout: 10000 })
    assert.equal(source.url(), `${origin}/`, "clicking a link keeps the original tab intact")
    assert.ok(await controls.getByRole("button", { name: "Cerrar vista de celular" }).isVisible())
    await waitUntil(async () => (await send({ type: "inline-refresh" })).state.tabUrl === `${origin}${path}`)
    console.log(`PASS: click navigation ${target} stays inside the phone`)
  }
  assert.equal(context.pages().length, count, "same-site links do not create tabs")
  await site.evaluate(() => {
    const form = document.createElement("form")
    form.action = "/confirmar"; form.target = "_top"
    form.style.cssText = "position:fixed;top:100px;left:20px;z-index:99999;background:white;padding:20px"
    const button = document.createElement("button")
    button.textContent = "Continuar pedido"; button.type = "submit"; button.formTarget = "_parent"
    form.append(button); document.body.append(form)
  })
  await site.getByRole("button", { name: "Continuar pedido", exact: true }).click()
  await site.waitForURL(url => url.pathname === "/confirmar")
  await waitUntil(async () => (await send({ type: "inline-refresh" })).state.tabUrl.includes("/confirmar"))
  await site.evaluate(() => {
    const link = document.createElement("a")
    link.textContent = "Ver resumen"; link.href = "/resumen"
    link.style.cssText = "position:fixed;top:100px;left:20px;z-index:99999;background:white;padding:20px"
    link.addEventListener("click", event => { event.preventDefault(); history.pushState({}, "", link.href); link.textContent = "Resumen abierto" })
    document.body.append(link)
  })
  await site.getByRole("link", { name: "Ver resumen", exact: true }).click()
  await site.getByRole("link", { name: "Resumen abierto", exact: true }).waitFor()
  assert.equal(site.url(), `${origin}/resumen`, "the site's SPA click handler keeps working")
  await site.evaluate(() => document.querySelector('a[href="/resumen"]').remove())
  console.log("PASS: form targets stay in the phone and SPA click handlers keep working")
  await site.getByRole("textbox").fill("Página interactiva ñ")
  assert.deepEqual(await site.evaluate(() => [innerWidth, innerHeight]), [393, 759])
  await site.getByRole("textbox").press("End")
  await site.getByRole("textbox").type(" · listo")
  assert.equal(await site.getByRole("textbox").inputValue(), "Página interactiva ñ · listo")
  await site.evaluate(() => scrollTo(0, 500))
  await site.waitForFunction(() => scrollY === 500)
  await site.evaluate(() => {
    const marker = document.createElement("div"); marker.id = "scroll-marker"
    marker.style.cssText = "position:absolute;left:10px;top:650px;width:50px;height:50px;background:rgb(255,0,128);z-index:99999"
    document.body.append(marker)
    const resolution = document.createElement("div"); resolution.id = "resolution-target"
    resolution.style.cssText = "position:fixed;left:120px;top:220px;width:64px;height:24px;background:repeating-linear-gradient(to right,#000 0px,#000 1px,#fff 1px,#fff 2px);z-index:99999"
    document.body.append(resolution)
  })
  // Use the native surface; Playwright's screenshot helper resets emulation.
  const cdp = await context.newCDPSession(source)
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })
  await writeFile("test-results/inline-simulator.png", Buffer.from(screenshot.data, "base64"))
  console.log("PASS: same tab and address, real mobile viewport, live keyboard and scrolling, restrictive CSP/X-Frame-Options")
  const resultPromise = context.waitForEvent("page")
  await clickCapture("Capturar pantalla")
  const result = await resultPromise
  await result.waitForFunction(() => document.querySelector(".captured-image")?.naturalWidth === 874)
  const pixels = await result.locator(".captured-image").evaluate(async image => {
    await image.decode(); const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0)
    return { size: [image.naturalWidth, image.naturalHeight], alpha: ctx.getImageData(0, 0, 1, 1).data[3], theme: [...ctx.getImageData(120, 60, 1, 1).data], background: [...ctx.getImageData(300, 1710, 1, 1).data], body: [...ctx.getImageData(440, 500, 1, 1).data] }
  })
  await result.screenshot({ path: "test-results/inline-visible-result.png" })
  assert.deepEqual(pixels.size, [874, 1781])
  assert.equal(pixels.alpha, 0, "the frame keeps transparent outside corners")
  assert.deepEqual(pixels.theme, [32, 48, 64, 255])
  assert.deepEqual(pixels.background, [246, 234, 217, 255])
  assert.notDeepEqual(pixels.body, [37, 39, 37, 255], "capture contains the site, not the simulator background")
  await result.getByRole("radio", { name: "Solo página", exact: true }).click().catch(() => result.getByRole("button", { name: "Solo página", exact: true }).click())
  await result.waitForFunction(() => document.querySelector(".captured-image")?.naturalWidth === 786)
  const markerPixel = await result.locator(".captured-image").evaluate(async image => {
    await image.decode(); const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0); return [...ctx.getImageData(40, 320, 1, 1).data]
  })
  assert.deepEqual(markerPixel, [255, 0, 128, 255], "visible capture preserves the user's scroll position when the browser zoom changes")
  const resolution = await result.locator(".captured-image").evaluate(image => {
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0)
    return [...ctx.getImageData(242, 450, 120, 1).data].filter((_, index) => index % 4 === 0)
  })
  assert.ok(resolution.every(value => value === 0 || value === 255), "2× capture renders actual sharp pixels instead of enlarging a soft 1× bitmap")
  await result.getByRole("radio", { name: "Con marco", exact: true }).click().catch(() => result.getByRole("button", { name: "Con marco", exact: true }).click())
  await result.waitForFunction(() => document.querySelector(".captured-image")?.naturalWidth === 874)
  const downloadPromise = result.waitForEvent("download")
  await result.getByRole("button", { name: "Descargar PNG", exact: true }).click()
  await (await downloadPromise).saveAs(resolve("test-results/iphone-14-pro-real.png"))
  await result.close()
  await source.bringToFront()
  await site.evaluate(() => { document.getElementById("scroll-marker").remove(); document.getElementById("resolution-target").remove() })
  await controls.getByRole("combobox", { name: "Modelo de dispositivo" }).click()
  const modelOptions = await controls.getByRole("option").allTextContents()
  assert.deepEqual(modelOptions.filter(name => name.startsWith("iPhone 15 ")), ["iPhone 15 · 393 × 852", "iPhone 15 Plus · 430 × 932", "iPhone 15 Pro · 393 × 852", "iPhone 15 Pro Max · 430 × 932"])
  assert.ok(modelOptions.findIndex(name => name.startsWith("iPhone 16 ")) < modelOptions.findIndex(name => name.startsWith("iPhone 15 ")))
  await writeFile("test-results/device-model-groups.png", Buffer.from((await cdp.send("Page.captureScreenshot", { format:"png",captureBeyondViewport:false })).data,"base64"))
  await controls.getByRole("option", { name: "iPhone 15 · 393 × 852", exact: true }).click()
  await site.waitForFunction(() => innerWidth === 393 && innerHeight === 759)
  assert.equal(await controls.getByRole("radio", { name: "Rosa", exact: true }).getAttribute("aria-checked"), "true")
  await controls.getByRole("radio", { name: "Amarillo", exact: true }).click()
  await waitUntil(async () => (await controls.getByRole("radio", { name: "Amarillo", exact: true }).getAttribute("aria-checked")) === "true")
  await controls.waitForFunction(() => document.querySelector(".device-shell")?.getAttribute("src").includes("iphone-15-yellow"))
  await controls.locator(".device-shell").evaluate(image => image.decode())
  assert.equal((await send({ type: "state" })).state.appliedProfile.color, "yellow")
  assert.equal(await site.getByRole("textbox").inputValue(), "Página interactiva ñ · listo")
  await controls.getByRole("button", { name: "Rotar dispositivo" }).click()
  await controls.waitForFunction(() => document.querySelector(".device-shell")?.getAttribute("src").includes("yellow-landscape"))
  await controls.getByRole("button", { name: "Rotar dispositivo" }).click()
  await controls.locator(".device-shell").evaluate(image => image.decode())
  await writeFile("test-results/iphone-15-yellow-simulator.png", Buffer.from((await cdp.send("Page.captureScreenshot", { format:"png",captureBeyondViewport:false })).data,"base64"))
  const colorPromise = context.waitForEvent("page")
  await clickCapture("Capturar pantalla")
  const colorResult = await colorPromise
  await colorResult.locator(".captured-image").waitFor()
  await colorResult.locator(".captured-image").evaluate(image => image.decode())
  const savedColor = await colorResult.evaluate(() => new Promise((resolve,reject) => {
    const open = indexedDB.open("encuadre-temporary",1)
    open.onsuccess = () => { const db=open.result; const request=db.transaction("captures").objectStore("captures").getAll(); request.onsuccess=() => {resolve(request.result[0]?.profile?.color);db.close()};request.onerror=reject }
    open.onerror=reject
  }))
  assert.equal(savedColor,"yellow","the export retains the chosen finish")
  await colorResult.close(); await source.bringToFront()
  console.log("PASS: iPhone 15 defaults to pink; color changes survive rotation, capture and saved preferences")
  await controls.getByRole("combobox", { name: "Modelo de dispositivo" }).click()
  await controls.getByRole("option", { name: "Google Pixel 8 · 412 × 915", exact: true }).click()
  await site.waitForFunction(() => innerWidth === 412 && innerHeight === 859)
  assert.equal(await site.getByRole("textbox").inputValue(), "Página interactiva ñ · listo", "changing models preserves the mobile document")
  await controls.getByRole("button", { name: "Rotar dispositivo" }).click()
  await site.waitForFunction(() => innerWidth === 915 && innerHeight === 364 && devicePixelRatio === 2)
  await worker.evaluate(async tabId => { await chrome.tabs.setZoomSettings(tabId, { mode: "automatic", scope: "per-tab" }); await chrome.tabs.setZoom(tabId, 1.25) }, sourceId)
  await site.evaluate(() => {
    const stripe = document.createElement("div"); stripe.id = "capture-stripe"
    stripe.style.cssText = "position:fixed;left:0;top:160px;width:100vw;height:100px;background:linear-gradient(to right,red 0%,red 50%,blue 50%,blue 100%);z-index:99999"
    document.body.append(stripe)
  })
  await waitUntil(() => worker.evaluate(tabId => chrome.tabs.getZoom(tabId).then(zoom => Math.abs(zoom - 1) < .001), sourceId))
  await site.waitForFunction(() => innerWidth === 915 && innerHeight === 364)
  assert.equal((await send({ type: "state" })).state.emulation.density, 2)
  const landscapePromise = context.waitForEvent("page")
  await clickCapture("Capturar pantalla")
  const landscape = await landscapePromise
  await landscape.waitForFunction(() => document.querySelector(".captured-image")?.naturalWidth === 1915)
  await landscape.getByRole("radio", { name: "Solo página", exact: true }).click().catch(() => landscape.getByRole("button", { name: "Solo página", exact: true }).click())
  await landscape.waitForFunction(() => document.querySelector(".captured-image")?.naturalWidth === 1830)
  const stripePixels = await landscape.locator(".captured-image").evaluate(async image => {
    await image.decode(); const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0)
    return { left: [...ctx.getImageData(20, 400, 1, 1).data], right: [...ctx.getImageData(1800, 400, 1, 1).data] }
  })
  assert.deepEqual(stripePixels.left, [255, 0, 0, 255]); assert.deepEqual(stripePixels.right, [0, 0, 255, 255], "wide captures include the part outside the physical browser viewport")
  assert.equal(await worker.evaluate(tabId => chrome.tabs.getZoom(tabId), sourceId), 1, "emulation keeps native zoom at 100% to preserve CSS dimensions and density")
  await landscape.close(); await source.bringToFront()
  await site.evaluate(() => document.getElementById("capture-stripe").remove())
  await controls.getByRole("button", { name: "Rotar dispositivo" }).click()
  await site.waitForFunction(() => innerWidth === 412 && innerHeight === 859)
  await site.evaluate(() => scrollTo({ top: 500, behavior: "instant" }))
  console.log("PASS: clean 2× framed screenshot, PWA colors, wide capture tiles, model changes and preserved mobile state")
  const fullPromise = context.waitForEvent("page")
  await clickCapture("Página completa")
  const full = await fullPromise
  await full.locator(".captured-image").waitFor()
  await full.locator(".captured-image").evaluate(image => image.decode())
  assert.equal(await full.locator(".captured-image").evaluate(image => image.naturalWidth), 824)
  assert.ok(await full.locator(".captured-image").evaluate(image => image.naturalHeight > 3000))
  const fullPixels = await full.locator(".captured-image").evaluate(image => {
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0)
    const strip = ctx.getImageData(canvas.width - 10, 0, 1, canvas.height).data
    let headerRows = 0
    for (let i = 0; i < strip.length; i += 4) if (Math.abs(strip[i] - 32) <= 2 && Math.abs(strip[i+1] - 38) <= 2 && Math.abs(strip[i+2] - 36) <= 2) headerRows++
    return { bottom: [...ctx.getImageData(canvas.width - 20, canvas.height - 20, 1, 1).data], headerRows }
  })
  assert.deepEqual(fullPixels.bottom, [200, 30, 40, 255], "the full-page image includes the actual footer")
  assert.ok(fullPixels.headerRows >= 90 && fullPixels.headerRows <= 100, "the fixed header appears once in the full-page image")
  await full.screenshot({ path: "test-results/inline-full-result.png" })
  await full.close()
  await source.bringToFront()
  await site.waitForFunction(() => innerWidth === 412 && innerHeight === 859 && scrollY === 500)
  await send({ type: "capture", kind: "visible" })
  await waitUntil(async () => (await send({ type: "state" })).state.stage === "capturing")
  const other = await context.newPage(); await other.goto(origin)
  await waitUntil(async () => (await send({ type: "state" })).state.stage === "error")
  assert.match((await send({ type: "state" })).state.error, /interrumpió/)
  await other.close(); await source.bringToFront()
  await controls.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  assert.equal(await controls.evaluate(() => document.documentElement.classList.contains("inline-snapshot")), false)
  assert.equal(await worker.evaluate(tabId => chrome.tabs.getZoom(tabId), sourceId), 1)
  console.log("PASS: switching tabs aborts capture and restores zoom/view without recording another page")
  const cancelResultPromise = context.waitForEvent("page")
  await clickCapture("Página completa")
  const cancelResult = await cancelResultPromise
  await cancelResult.getByRole("button", { name: "Cancelar captura", exact: true }).click()
  await waitUntil(async () => (await send({ type: "state" })).state.stage === "cancelled")
  await site.waitForFunction(() => scrollY === 500)
  assert.equal(await site.evaluate(() => scrollY), 500)
  assert.equal(await site.evaluate(() => Array.from(document.querySelectorAll("style")).some(style => style.textContent.includes("animation-play-state"))), false)
  await cancelResult.close(); await source.bringToFront()
  // The close action destroys its own frame. Schedule it after the evaluation
  // returns, then verify the original page; Chromium can lose the input ack
  // when an out-of-process extension iframe removes itself during a click.
  const closeButton = controls.getByRole("button", { name: "Cerrar vista de celular" })
  await waitUntil(() => closeButton.isEnabled())
  assert.ok(await closeButton.isVisible(), "the close button is visible")
  await closeButton.evaluate(button => { setTimeout(() => button.click(), 100) })
  await source.waitForFunction(() => !document.getElementById("encuadre-simulator") && !document.body.inert)
  // Removing the iframe precedes draining metric updates, detaching the
  // debugger and restoring Chrome's zoom. Wait for the whole close operation.
  await waitUntil(async () => !(await send({ type: "state" })).state.inline)
  assert.equal(await source.getByRole("textbox").inputValue(), "Estado original ñ", "closing returns to the untouched original document")
  assert.ok(await source.evaluate(() => innerWidth > 1000), "closing restores the desktop viewport at the user's zoom")
  assert.equal(await worker.evaluate(tabId => chrome.tabs.getZoom(tabId), sourceId), 1.25)
  console.log("PASS: full-page export, cancellation, viewport/scroll restoration, closing restores the original page")
  await send({ type: "apply", profile, scale: "fit" })
  await send({ type: "simulator" })
  const reopened = source.frames().find(frame => frame.name() === "encuadre-controls")
  await reopened.getByRole("button", { name: "Cerrar vista de celular" }).waitFor()
  await source.goto(`${origin}/other`)
  await waitUntil(async () => (await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).length === 0)
  assert.equal(await source.evaluate(() => document.body.inert), false)
  console.log("PASS: navigation removes temporary frame rules; closing and navigation restore the framed emulation session")
} catch (error) {
  const worker = context?.serviceWorkers()[0]
  if (worker) console.log("Failed capture state:", await worker.evaluate(async () => (await chrome.storage.session.get("state")).state).catch(() => null))
  throw error
} finally {
  await context?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  assert.equal(dirname(resolve(userData)), resolve(tmpdir())); assert.ok(basename(userData).startsWith("encuadre-inline-"))
  await rm(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
