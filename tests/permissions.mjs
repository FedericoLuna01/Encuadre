import assert from "node:assert/strict"
import { chromium } from "playwright"
import { createServer } from "node:http"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { waitUntil } from "./helpers.mjs"

// Load the unmodified production build. No host grants or mocked Chrome APIs.
const extension = resolve("dist")
const manifest = JSON.parse(await readFile(join(extension, "manifest.json"), "utf8"))
assert.equal(manifest.host_permissions, undefined)
assert.equal(manifest.optional_host_permissions, undefined)
assert.ok(manifest.permissions.includes("activeTab"))
const profile = await mkdtemp(join(tmpdir(), "encuadre-permissions-"))
const server = createServer((_req, res) => {
  res.setHeader("Content-Type", "text/html;charset=utf-8")
  res.setHeader("X-Frame-Options", "DENY")
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'")
  res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Permisos reales</title>
    <input aria-label="Nota"><a href="/siguiente">Siguiente</a>
    <main style="height:1800px;background:#e0eadf">Página de prueba</main><footer>Fin de página</footer>`)
})
let context
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  context = await chromium.launchPersistentContext(profile, {
    locale: "es-AR", channel: "chromium", headless: true, viewport: null,
    args: ["--lang=es", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--window-size=1440,1100"],
  })
  context.setDefaultTimeout(30000)
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker")
  const id = new URL(worker.url()).host
  const browser = await context.browser().newBrowserCDPSession()
  const source = context.pages()[0]
  await source.goto(origin)
  const tabId = await worker.evaluate(async origin => (await chrome.tabs.query({})).find(tab => tab.url === `${origin}/`).id, origin)
  const access = () => worker.evaluate(async tabId => {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, func: () => location.href })
      return true
    } catch { return false }
  }, tabId)
  const state = () => worker.evaluate(async () => (await chrome.storage.session.get("state")).state)
  assert.equal(await access(), false, "the site is inaccessible before invoking the action")

  // Attach only to the popup; a page debugger would conflict with the emulator.
  async function openAction() {
    await source.bringToFront()
    const targets = (await browser.send("Target.getTargets", { filter: [{ type: "tab" }] })).targetInfos
    const target = targets.find(target => target.type === "tab" && target.url === source.url())
    assert.ok(target)
    await browser.send("Extensions.triggerAction", { id, targetId: target.targetId })
    const popup = await waitUntil(async () => (await browser.send("Target.getTargets")).targetInfos.find(target => target.url === `chrome-extension://${id}/index.html`))
    const { sessionId } = await browser.send("Target.attachToTarget", { targetId: popup.targetId, flatten: false })
    let sequence = 0
    const pending = new Map()
    const receive = event => {
      if (event.sessionId !== sessionId) return
      const message = JSON.parse(event.message)
      const job = pending.get(message.id)
      if (job) { pending.delete(message.id); message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result) }
    }
    browser.on("Target.receivedMessageFromTarget", receive)
    const evaluate = expression => new Promise((resolve, reject) => {
      const messageId = ++sequence
      pending.set(messageId, { resolve, reject })
      void browser.send("Target.sendMessageToTarget", { sessionId, message: JSON.stringify({ id: messageId, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }) }).catch(reject)
    }).then(result => {
      assert.equal(result.exceptionDetails, undefined)
      return result.result.value
    })
    await waitUntil(() => evaluate(`document.querySelector('.control-sheet')?.getAttribute('aria-busy') === 'false'`))
    assert.equal(await evaluate(`document.documentElement.dataset.surface`), "popup")
    return {
      waitClosed: async () => {
        await waitUntil(async () => !(await browser.send("Target.getTargets")).targetInfos.some(target => target.targetId === popup.targetId))
        browser.off("Target.receivedMessageFromTarget", receive)
      },
      click: async label => {
        const selector = `[...document.querySelectorAll('.popup-actions button')].find(button => button.querySelector('strong')?.textContent === ${JSON.stringify(label)})`
        assert.equal(await evaluate(`!!(${selector}) && !(${selector}).disabled`), true)
        // Do not wait for the action, which may close its popup.
        await evaluate(`setTimeout(() => (${selector}).click(), 0); true`)
      },
      close: async () => {
        browser.off("Target.receivedMessageFromTarget", receive)
        await browser.send("Target.closeTarget", { targetId: popup.targetId })
      },
    }
  }

  const popup = await openAction()
  assert.equal(await access(), true, "the toolbar invocation grants activeTab")
  const nextResult = context.waitForEvent("page", { predicate: page => page.url().includes("result.html") })
  await popup.click("Capturar página completa")
  const result = await nextResult
  await result.locator(".captured-image").evaluate(image => image.decode())
  const dimensions = await result.locator(".captured-image").evaluate(image => ({ width: image.naturalWidth, height: image.naturalHeight }))
  assert.ok(dimensions.width > 0 && dimensions.height >= 1800)
  assert.equal((await state()).stage, "done")
  await popup.close()
  await result.close()
  console.log("PASS: native toolbar grants access and desktop full capture succeeds with production permissions")

  await source.goto(`${origin}/otra-ruta`)
  assert.equal(await access(), true, "same-origin navigation preserves the grant")
  await source.getByLabel("Nota").fill("Conservar ñ")
  const emulatorPopup = await openAction()
  await emulatorPopup.click("Emulador de celular")
  await emulatorPopup.waitClosed()
  await source.waitForSelector("#encuadre-simulator")
  await waitUntil(async () => (await state()).inline && (await state()).emulation)
  const site = await waitUntil(() => source.frames().find(frame => frame.name() === "encuadre-site"))
  const controls = await waitUntil(() => source.frames().find(frame => frame.name() === "encuadre-controls"))
  await site.getByRole("link", { name: "Siguiente" }).click()
  await site.waitForURL(`${origin}/siguiente`)
  await waitUntil(async () => (await state()).tabUrl === `${origin}/siguiente`)
  assert.ok(await source.locator("#encuadre-simulator").count())
  const mobileResult = context.waitForEvent("page", { predicate: page => page.url().includes("result.html") }).catch(async error => {
    throw new Error(`${error.message}\nCapture state: ${JSON.stringify(await state())}\nControls: ${await controls.locator("body").innerText()}`)
  })
  await controls.getByRole("button", { name: "Capturar pantalla", exact: true }).click()
  const mobile = await mobileResult
  await mobile.locator(".captured-image").evaluate(image => image.decode())
  assert.equal((await state()).stage, "done")
  await mobile.close()
  await source.bringToFront()
  await controls.getByRole("button", { name: "Volver a escritorio", exact: true }).click()
  await source.waitForSelector("#encuadre-simulator", { state: "detached" })
  assert.equal(await source.getByLabel("Nota").inputValue(), "Conservar ñ")
  assert.deepEqual(await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules()), [])
  // Target.attached also includes Playwright's own connection. Check whether
  // this extension can still issue debugger commands instead.
  await assert.rejects(worker.evaluate(tabId => chrome.debugger.sendCommand({ tabId }, "Page.getLayoutMetrics"), tabId), /not attached/i)
  console.log("PASS: framed navigation and capture, original form restoration, debugger and temporary rule cleanup")

  // Same server, different host: the old activeTab grant must no longer work.
  await source.goto(`${origin.replace("127.0.0.1", "localhost")}/otro-sitio`)
  assert.equal(await access(), false, "cross-origin navigation revokes site access")
  const renewed = await openAction()
  assert.equal(await access(), true, "invoking the toolbar grants access to the new origin")
  await renewed.close()
  console.log("PASS: cross-origin navigation revokes access until a fresh toolbar invocation")
} finally {
  await context?.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  assert.equal(dirname(resolve(profile)), resolve(tmpdir()))
  assert.ok(basename(profile).startsWith("encuadre-permissions-"))
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
