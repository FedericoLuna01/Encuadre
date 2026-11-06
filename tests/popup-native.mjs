import { chromium } from "playwright"
import { mkdtemp, rm, mkdir, writeFile, readFile, cp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve, join, dirname, basename } from "node:path"
import assert from "node:assert/strict"
import { createServer } from "node:http"

const profile = await mkdtemp(join(tmpdir(), "encuadre-popup-"))
const server = createServer((_req, res) => { res.setHeader("Content-Type", "text/html;charset=utf-8"); res.end("<!doctype html><title>Prueba del popup</title><p>Página de prueba</p>") })
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
const origin = `http://127.0.0.1:${server.address().port}`
let context
try {
  const extension = join(profile, "extension")
  await cp(resolve("dist"), extension, { recursive: true })
  const manifest = JSON.parse(await readFile(join(extension, "manifest.json"), "utf8"))
  manifest.host_permissions = ["<all_urls>"] // Layout test: programmatic openPopup does not grant activeTab.
  await writeFile(join(extension, "manifest.json"), JSON.stringify(manifest))
  context = await chromium.launchPersistentContext(join(profile, "chrome-profile"), { locale: "es-AR", channel: "chromium", headless: true, viewport: null, args: ["--lang=es", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--window-size=1440,1000"] })
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker")
  await context.pages()[0].goto(origin)
  await worker.evaluate(() => chrome.action.openPopup())
  await new Promise(resolve => setTimeout(resolve, 800))
  const browserSession = await context.browser().newBrowserCDPSession()
  const targets = (await browserSession.send("Target.getTargets")).targetInfos
  const target = targets.find(t => t.url.endsWith("index.html"))
  assert.ok(target, "native action popup is available for inspection")
  const { sessionId } = await browserSession.send("Target.attachToTarget", { targetId: target.targetId, flatten: false })
  let sequence = 0
  const pending = new Map()
  browserSession.on("Target.receivedMessageFromTarget", event => {
    const message = JSON.parse(event.message)
    const job = pending.get(message.id)
    if (job) { pending.delete(message.id); message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result) }
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence
    pending.set(id, { resolve, reject })
    void browserSession.send("Target.sendMessageToTarget", { sessionId, message: JSON.stringify({ id, method, params }) }).catch(reject)
  })
  await send("Runtime.evaluate", { expression: 'chrome.runtime.sendMessage({type:"apply",profile:{id:"iphone-15-pro",name:"iPhone 15 Pro",width:393,height:852,kind:"phone"},scale:"fit"})', awaitPromise: true, returnByValue: true })
  await send("Runtime.evaluate", { expression: 'chrome.storage.local.set({preferences:{profile:{id:"iphone-15-pro",name:"iPhone 15 Pro",width:393,height:852,kind:"phone"},customProfiles:[],format:"png",quality:90,previewScale:"fit"}})', awaitPromise: true })
  // Reopen to load the saved profile exactly as a user would.
  await send("Runtime.evaluate", { expression: 'location.reload()' })
  await new Promise(resolve => setTimeout(resolve, 500))
  const result = await send("Runtime.evaluate", { expression: '({ width: innerWidth, height: innerHeight, body: document.body.getBoundingClientRect().toJSON(), context: chrome.extension.getViews({ type: "popup" }).includes(window) })', returnByValue: true })
  const size = result.result.value
  console.log("native popup", size)
  await mkdir("test-results", { recursive: true })
  const screenshot = await send("Page.captureScreenshot", { format: "png" })
  await writeFile("test-results/popup-native.png", Buffer.from(screenshot.data, "base64"))
  assert.ok(size.context)
  assert.ok(size.width === 360 && size.height < 500, "native popup fits the approved layout and sizes to its content")
  const layout = (await send("Runtime.evaluate", { expression: `(() => {
    const sheet = document.querySelector('.control-sheet');
    const controls = [...document.querySelectorAll('button,input')].filter(el => el.checkVisibility());
    return { scroll: sheet.scrollHeight - sheet.clientHeight, clipped: controls.filter(el => { const r=el.getBoundingClientRect(); return r.top<0 || r.bottom>innerHeight || r.right>innerWidth }).map(el=>el.textContent||el.id) };
  })()`, returnByValue: true })).result.value
  console.log("native layout", layout)
  assert.deepEqual(layout.clipped, [], "all default popup controls are visible without clipping")
  assert.ok(layout.scroll <= 1, "default controls fit together without scrolling")
  const actions = (await send("Runtime.evaluate", { expression: `[...document.querySelectorAll('.popup-actions button')].map(el => ({text: el.querySelector('strong').textContent, disabled: el.disabled, rect: el.getBoundingClientRect().toJSON()}))`, returnByValue: true })).result.value
  assert.deepEqual(actions.map(action => action.text), ["Capturar página completa", "Capturar pantalla", "Emulador de celular"])
  assert.ok(actions.every(action => !action.disabled))
  assert.ok(actions[0].rect.bottom < actions[1].rect.top, "primary capture appears above the secondary actions")
  assert.equal(actions[1].rect.top, actions[2].rect.top, "secondary actions share one row")
  assert.ok(actions[1].rect.right < actions[2].rect.left, "secondary actions do not overlap")
  // Opening a phone must work from the default desktop preference, with no picker step.
  await send("Runtime.evaluate", { expression: 'chrome.storage.local.remove("preferences")', awaitPromise: true })
  await send("Runtime.evaluate", { expression: 'chrome.runtime.sendMessage({type:"apply",profile:null,scale:"fit"})', awaitPromise: true })
  await send("Runtime.evaluate", { expression: 'location.reload()' })
  await new Promise(resolve => setTimeout(resolve, 600))
  await send("Runtime.evaluate", { expression: `document.querySelectorAll('.popup-actions button')[2].click()` })
  const deadline = Date.now() + 20000
  let state
  do {
    state = await worker.evaluate(async () => (await chrome.storage.session.get("state")).state)
    if (state.inline && state.message === "Celular abierto en esta pestaáa") break
    await new Promise(resolve => setTimeout(resolve, 100))
  } while (Date.now() < deadline)
  assert.equal(state.inline, true)
  assert.equal(state.appliedProfile.id, "iphone-13")
  console.log("PASS: compact native popup and one-click emulator from desktop")

} finally {
  await context?.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  assert.equal(dirname(resolve(profile)), resolve(tmpdir()))
  assert.ok(basename(profile).startsWith("encuadre-popup-"))
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
