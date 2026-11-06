import assert from "node:assert/strict"
import { chromium } from "playwright"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve, sep } from "node:path"
import { createServer } from "node:http"
import { waitUntil } from "./helpers.mjs"

const profile = await mkdtemp(join(tmpdir(), "encuadre-action-"))
const server = createServer((_req, res) => {
  res.setHeader("Content-Type", "text/html;charset=utf-8")
  res.end("<!doctype html><title>Sitio compatible</title><p>Encuadre</p>")
})
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
const origin = `http://127.0.0.1:${server.address().port}`
let context
try {
  const extension = resolve("dist")
  context = await chromium.launchPersistentContext(profile, {
    locale: "es-AR", channel: "chromium", headless: true,
    args: ["--lang=es", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  })
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker")
  const availableTitle = await worker.evaluate(() => chrome.i18n.getMessage("actionTitle"))
  const action = () => worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    return {
      url: tab.url,
      enabled: await chrome.action.isEnabled(tab.id),
      title: await chrome.action.getTitle({ tabId: tab.id }),
    }
  })
  const check = async (enabled, title) => {
    await waitUntil(async () => {
      const state = await action()
      return state.enabled === enabled && state.title.includes(title)
    }, 5000)
  }
  const page = context.pages()[0]
  await page.goto("chrome://extensions")
  await check(false, "no está disponible")
  // Production permissions only: no host grants and no extension click.
  await page.goto(origin)
  await check(true, availableTitle)
  assert.equal((await action()).url, `${origin}/`)
  await page.goto("data:text/html,<p>Sin acceso</p>")
  await check(false, "no está disponible")
  await page.goto(origin)
  await check(true, availableTitle)

  // Chromium's protected store page cannot be fulfilled by request routing.
  await page.goto("https://chromewebstore.google.com/", { waitUntil: "domcontentloaded" })
  await check(false, "tienda de extensiones")
  const compatible = await context.newPage()
  await compatible.goto(origin)
  await check(true, availableTitle)
  await page.bringToFront()
  await check(false, "tienda de extensiones")
  await compatible.bringToFront()
  await check(true, availableTitle)
  console.log("PASS: toolbar reacts to navigation, restricted pages and tab activation without a site grant")
} finally {
  await context?.close()
  await new Promise(resolve => server.close(resolve))
  // mkdtemp creates this isolated profile under the system temporary directory.
  if (!resolve(profile).startsWith(resolve(tmpdir()) + sep)) throw new Error("Unexpected temporary profile path")
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
