import { t } from "./i18n"
import type { EmulationSettings, Profile } from "./model"

function mobileAgent(profile: Profile) {
  if (profile.id.startsWith("iphone")) return "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
  if (profile.kind === "tablet") return "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
  if (profile.kind === "phone") return navigator.userAgent.replace(/\([^)]*\)/, "(Linux; Android 14)").replace(" Safari/", " Mobile Safari/")
  return navigator.userAgent
}

interface Session {
  profile: Profile; settings: EmulationSettings; children: Set<string>
  update: Promise<void>
  restoreViewport: { width: number; height: number }
  browser: { width: number; height: number; windowId: number; restoreZoom: number; zoomSettings: chrome.tabs.ZoomSettings }
}
const sessions = new Map<number, Session>()
const autoAttach = { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: [{ type: "iframe", exclude: false }, { exclude: true }] }

async function renderer(debuggee: chrome.debugger.DebuggerSession, profile: Profile, settings: EmulationSettings) {
  await chrome.debugger.sendCommand(debuggee, "Emulation.setUserAgentOverride", { userAgent: settings.userAgent || mobileAgent(profile) })
  await chrome.debugger.sendCommand(debuggee, "Emulation.setTouchEmulationEnabled", { enabled: settings.touch, maxTouchPoints: settings.touch ? 5 : 1 })
}

chrome.debugger.onEvent.addListener((source, method, raw) => {
  if (source.tabId === undefined || method !== "Target.attachedToTarget") return
  const session = sessions.get(source.tabId)
  const event = raw as { sessionId: string }
  const debuggee = { tabId: source.tabId, sessionId: event.sessionId }
  void (async () => {
    try {
      if (session) {
        session.children.add(event.sessionId)
        await renderer(debuggee, session.profile, session.settings)
        await chrome.debugger.sendCommand(debuggee, "Target.setAutoAttach", autoAttach)
      }
    } finally { await chrome.debugger.sendCommand(debuggee, "Runtime.runIfWaitingForDebugger").catch(() => {}) }
  })().catch(() => {})
})

export async function configureEmulation(tabId: number, profile: Profile, settings: EmulationSettings) {
  const session = sessions.get(tabId)
  if (!session) throw new Error(t("La emulación se desconectó. Volvé a abrir la vista de celular."))
  const update = session.update.catch(() => {}).then(() => applyEmulation(tabId, session, profile, settings))
  session.update = update
  await update
}

async function applyEmulation(tabId: number, session: Session, profile: Profile, settings: EmulationSettings) {
  if (sessions.get(tabId) !== session) throw new Error(t("La emulación se desconectó. Volvé a abrir la vista de celular."))
  session.profile = profile; session.settings = settings
  await renderer({ tabId }, profile, settings)
  await Promise.all([...session.children].map(async sessionId => {
    try { await renderer({ tabId, sessionId }, profile, settings) }
    catch { session.children.delete(sessionId) }
  }))
  // UA/touch changes enqueue renderer preferences; let those visual properties
  // settle before applying the density that must remain in effect.
  await new Promise(resolve => setTimeout(resolve, 100))
  if (sessions.get(tabId) !== session) return
  // Apply metrics last: renderer updates must not leave the document at its
  // native density. Zero dimensions also disable density for the document.
  await chrome.debugger.sendCommand({ tabId }, "Emulation.clearDeviceMetricsOverride")
  const metrics = await chrome.debugger.sendCommand({ tabId }, "Page.getLayoutMetrics")
  const viewport = metrics && "cssLayoutViewport" in metrics ? metrics.cssLayoutViewport : undefined
  if (!viewport || typeof viewport !== "object" || !("clientWidth" in viewport) || !("clientHeight" in viewport) || typeof viewport.clientWidth !== "number" || typeof viewport.clientHeight !== "number") throw new Error(t("No se pudieron leer las medidas de la ventana."))
  const params = { width: viewport.clientWidth, height: viewport.clientHeight, deviceScaleFactor: settings.density, mobile: true }
  // Chrome can coalesce visual updates even after acknowledging CDP commands.
  // Separate two distinct densities without changing the CSS viewport size.
  await chrome.debugger.sendCommand({ tabId }, "Emulation.setDeviceMetricsOverride", { ...params, deviceScaleFactor: settings.density === 3 ? 2 : 3 })
  await new Promise(resolve => setTimeout(resolve, 250))
  if (sessions.get(tabId) !== session) return
  await chrome.debugger.sendCommand({ tabId }, "Emulation.setDeviceMetricsOverride", params)
  await new Promise(resolve => setTimeout(resolve, 250))
}

export async function startEmulation(tabId: number, profile: Profile, settings: EmulationSettings) {
  const tab = await chrome.tabs.get(tabId)
  if (!tab.active) await chrome.tabs.update(tabId, { active: true })
  const restoreZoom = await chrome.tabs.getZoom(tabId), zoomSettings = await chrome.tabs.getZoomSettings(tabId)
  await chrome.tabs.setZoomSettings(tabId, { mode: "automatic", scope: "per-tab" })
  await chrome.tabs.setZoom(tabId, 1)
  const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: () => ({ width: innerWidth, height: innerHeight }) })
  const browser = await chrome.windows.get(tab.windowId)
  try { await chrome.debugger.attach({ tabId }, "1.3") }
  catch (error) { await chrome.tabs.setZoomSettings(tabId, zoomSettings); await chrome.tabs.setZoom(tabId, restoreZoom); throw error }
  // Chrome adds its debugger banner asynchronously and changes the content
  // bounds. Measure the attached viewport after that native resize settles.
  await new Promise(resolve => setTimeout(resolve, 150))
  sessions.set(tabId, { profile, settings, children: new Set(), update: Promise.resolve(), restoreViewport: result.result!, browser: { width: browser.width!, height: browser.height!, windowId: tab.windowId, restoreZoom, zoomSettings } })
  try {
    await configureEmulation(tabId, profile, settings)
    await chrome.debugger.sendCommand({ tabId }, "Target.setAutoAttach", autoAttach)
  } catch (error) { await stopEmulation(tabId); throw error }
}

chrome.windows.onBoundsChanged.addListener(browser => {
  for (const [tabId, session] of sessions) {
    if (session.browser.windowId !== browser.id || !browser.width || !browser.height) continue
    if (session.browser.width === browser.width && session.browser.height === browser.height) continue
    session.restoreViewport.width = Math.max(300, Math.round(session.restoreViewport.width + (browser.width - session.browser.width)))
    session.restoreViewport.height = Math.max(200, Math.round(session.restoreViewport.height + (browser.height - session.browser.height)))
    session.browser.width = browser.width; session.browser.height = browser.height
    void configureEmulation(tabId, session.profile, session.settings).catch(() => {})
  }
})

chrome.tabs.onZoomChange.addListener(({ tabId, newZoomFactor }) => {
  const session = sessions.get(tabId)
  if (!session || Math.abs(newZoomFactor - 1) < .001) return
  session.browser.restoreZoom = newZoomFactor
  void chrome.tabs.setZoom(tabId, 1).then(() => configureEmulation(tabId, session.profile, session.settings)).catch(() => {})
})

export async function stopEmulation(tabId: number) {
  const session = sessions.get(tabId)
  sessions.delete(tabId)
  try { await chrome.debugger.detach({ tabId }) } catch { /* Already detached by Chrome or DevTools. */ }
  if (!session) return
  try {
    await chrome.tabs.setZoomSettings(tabId, session.browser.zoomSettings)
    await chrome.tabs.setZoom(tabId, session.browser.restoreZoom)
  } catch { return }
  // Chrome removes its infobar asynchronously; wait for the native viewport
  // before another desktop capture starts with the temporarily reduced height.
  const deadline = Date.now() + 2500
  while (Date.now() < deadline) {
    try {
      const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: () => ({ width: innerWidth, height: innerHeight }) })
      if (Math.abs(result.result!.width - session.restoreViewport.width / session.browser.restoreZoom) <= 2 && Math.abs(result.result!.height - session.restoreViewport.height / session.browser.restoreZoom) <= 2) return
    } catch { return }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

