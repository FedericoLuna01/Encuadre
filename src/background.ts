import { t, formatNumber, isLocalizedMessage } from "./lib/i18n"
import { installTouchInput } from "./lib/touch-input"
import { installFrameNavigation } from "./lib/emulator-navigation"
import { startEmulation, stopEmulation, configureEmulation } from "./lib/emulation"
import { isEmulationSettings, isProfile, initialState, isBusy, outputSize, profiles, validDimensions, type CaptureRecord, type CaptureState, type PageAppearance, type Profile, type Reply, type Request } from "./lib/model"
import { clearCaptures, getPreferences, saveCapture } from "./lib/store"
import { inspectPage, limitations, preparePage, restorePage, scrollPage, readPageAppearance, readPageManifest, stitchChrome, waitForVisibleResources } from "./lib/page"
import { deviceViewport, frameAsset } from "./lib/device-viewport"
import { mountInlineView, unmountInlineView, sizeInlineCapture } from "./lib/inline-page"
import type { CaptureControl, CaptureControlReply, CaptureRect } from "./lib/capture-control"
import { AVAILABLE_TITLE, pageUnavailableReason } from "./lib/page-availability"

async function refreshAction(tabId: number) {
  try {
    const tab = await chrome.tabs.get(tabId)
    const reason = pageUnavailableReason(tab.pendingUrl ?? tab.url)
    const path = Object.fromEntries([16, 32, 48, 128].map(size => [size, `icons/${reason ? "disabled-" : ""}icon-${size}.png`]))
    await Promise.all([
      chrome.action.setIcon({ tabId, path }),
      chrome.action.setTitle({ tabId, title: reason ? `Encuadre · ${reason}` : chrome.i18n.getMessage("actionTitle") || AVAILABLE_TITLE }),
      reason ? chrome.action.disable(tabId) : chrome.action.enable(tabId),
    ])
  } catch {
    // A tab can disappear while Chrome is updating its toolbar action.
  }
}

// Refresh existing tabs on installation, reload and service worker startup.
void chrome.tabs.query({}).then(tabs => Promise.all(tabs.map(tab => tab.id === undefined ? undefined : refreshAction(tab.id))))
chrome.tabs.onActivated.addListener(({ tabId }) => {
  void refreshAction(tabId)
  void ready.then(async () => {
    if (tabId === state.tabId && state.inline && state.appliedProfile && state.emulation && !changing && !isBusy(state.stage)) {
      await configureEmulation(tabId, state.appliedProfile, state.emulation)
    }
  }).catch(() => {})
})
chrome.tabs.onCreated.addListener(tab => { if (tab.id !== undefined) void refreshAction(tab.id) })

let state: CaptureState = { ...initialState }
let changing = false
let cancelled = false
let interruption: string | undefined
let navigationInterrupted = false
let resultTab: number | undefined
let pendingResultTab: number | undefined
let lastShot = 0
let touchFrame: number | undefined
let touchSequence = Promise.resolve()
let inputRevision = 0
const RULE_ID = 101
const SCROLLBAR_CSS = "* { scrollbar-width:none!important; } ::-webkit-scrollbar { display:none!important; }"
// A native cursor stays out of exported captures and follows the pointer without lag.
const TOUCH_CURSOR_CSS = `* , *::before, *::after { cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='10' fill='%23202020' fill-opacity='.28' stroke='white' stroke-opacity='.9' stroke-width='2'/%3E%3C/svg%3E") 16 16, crosshair !important; }`
const styledFrames = new Set<string>()
type World = { frameId: number }
type PageInfo = Awaited<ReturnType<typeof inspectPage>>
let manifestCache: { key: string; colors: { theme_color?: string; background_color?: string }; pending?: Promise<unknown> } | undefined
const ready = chrome.storage.session.get(["state", "resultTab"]).then(data => {
  if (data.state) state = data.state as CaptureState
  resultTab = typeof data.resultTab === "number" ? data.resultTab : undefined
  if (isBusy(state.stage)) state = { ...state, stage: "error", error: t("La captura se interrumpió. Volvé a intentarlo."), message: t("Captura interrumpida") }
})

function update(patch: Partial<CaptureState>) {
  state = { ...state, ...patch }
  void chrome.storage.session.set({ state, resultTab: resultTab ?? null })
}

async function evaluate<T, Args extends unknown[]>(tabId: number, world: World, func: (...args: Args) => T, ...args: Args): Promise<Awaited<T>> {
  const [result] = await chrome.scripting.executeScript({ target: { tabId, frameIds: [world.frameId] }, func, args })
  if (!result) throw new Error(t("La página no respondió. Volvé a abrir Encuadre desde su ícono."))
  return result.result as Awaited<T>
}

async function configureTouchInput(tabId: number, world: World, enabled: boolean) {
  const injection: chrome.scripting.CSSInjection = { target: { tabId, frameIds: [world.frameId] }, css: TOUCH_CURSOR_CSS, origin: "USER" }
  await chrome.scripting.removeCSS(injection)
  if (enabled) await chrome.scripting.insertCSS(injection)
  await evaluate(tabId, world, installTouchInput, enabled)
}

async function context(tabId: number): Promise<World> {
  if (!state.inline) return { frameId: 0 }
  // allFrames only injects into frames covered by the current site grant. The
  // extension UI is intentionally excluded; it communicates through messages.
  const frames = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: () => ({ name: window.name, parent: location.ancestorOrigins[0] }) })
  const frame = frames.find(frame => frame.result?.name === "encuadre-site" && frame.result.parent === `chrome-extension://${chrome.runtime.id}`)
  if (!frame) throw new Error(t("La página del celular todavía se está abriendo."))
  return { frameId: frame.frameId }
}

function describeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (isLocalizedMessage(message)) return message
  if (/Cannot access|permission|host permission|activeTab|not allowed/i.test(message)) return t("Volvé a abrir Encuadre desde su ícono en la página que querés capturar para darle acceso a ese sitio.")
  if (/No tab|closed|No frame|No document|not found/i.test(message)) return t("La pestaña de origen se cerró o cambió de página. Volvé a abrir Encuadre.")
  if (/memory|large|size|encoding|quota/i.test(message)) return t("No alcanzaron los recursos para generar la imagen. Probá con un ancho menor o capturá solo la pantalla.")
  return t("No se pudo completar la operación: {message}", { message })
}

async function setTarget(tabId?: number) {
  const tab = tabId !== undefined ? await chrome.tabs.get(tabId) : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]
  if (tab?.id === undefined || pageUnavailableReason(tab.pendingUrl ?? tab.url)) throw new Error(t("Chrome no permite capturar esta página. Abrí un sitio HTTP, HTTPS o localhost y activá Encuadre."))
  if (state.tabId !== undefined && state.tabId !== tab.id) await closeView()
  update({ tabId: tab.id, tabUrl: tab.url, tabTitle: tab.title, stage: "idle", error: undefined, message: t("Lista para capturar") })
  return tab.id
}

async function setFrameRule(tabId: number, url: string) {
  const origin = new URL(url).origin
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [RULE_ID], addRules: [{
    id: RULE_ID, priority: 1,
    action: { type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS, responseHeaders: [
      { header: "x-frame-options", operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
      { header: "content-security-policy", operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
    ] },
    condition: { tabIds: [tabId], urlFilter: `|${origin}/`, resourceTypes: [chrome.declarativeNetRequest.ResourceType.SUB_FRAME] },
  }] })
}

async function closeView() {
  inputRevision++
  const tabId = state.tabId
  const emulating = !!state.emulation
  update({ emulation: undefined })
  // Detach before removing the embedded renderer. Pending metric updates must
  // be cancelled while their target still exists.
  if (emulating && tabId !== undefined) await stopEmulation(tabId)
  if (state.inline && tabId !== undefined) {
    try { await evaluate(tabId, { frameId: 0 }, unmountInlineView) } catch { /* The original document may have navigated. */ }
  }
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [RULE_ID] })
  styledFrames.clear(); touchFrame = undefined
  update({ inline: false, appliedProfile: null, scale: 1, appearance: undefined })
}

async function appearance(tabId: number, world: World, page: PageInfo, wait = false): Promise<PageAppearance> {
  const key = `${tabId}:${page.timeOrigin}:${page.manifestUrl}`
  if (manifestCache?.key !== key) {
    const cache: NonNullable<typeof manifestCache> = { key, colors: {} }
    manifestCache = cache
    if (page.manifestUrl) cache.pending = evaluate(tabId, world, readPageManifest, page.manifestUrl).then(colors => { cache.colors = colors }).catch(() => {})
  }
  if (wait) await manifestCache.pending
  return evaluate(tabId, world, readPageAppearance, manifestCache.colors)
}

async function refreshView() {
  if (!state.inline || state.tabId === undefined || !state.appliedProfile) return
  const tabId = state.tabId, world = await context(tabId)
  let page = await evaluate(tabId, world, inspectPage)
  if (!/^https?:/.test(page.href)) return
  const key = `${tabId}:${world.frameId}:${page.timeOrigin}`
  if (!styledFrames.has(key)) {
    await chrome.scripting.insertCSS({ target: { tabId, frameIds: [world.frameId] }, css: SCROLLBAR_CSS, origin: "USER" })
    await evaluate(tabId, world, installFrameNavigation)
    await configureTouchInput(tabId, world, state.emulation?.touch ?? false)
    touchFrame = world.frameId
    // Apply density after preparing a new document. Reapplying it on every
    // progress poll resizes the browser surface and interrupts open controls.
    if (state.emulation) {
      await configureEmulation(tabId, state.appliedProfile, state.emulation)
      page = await evaluate(tabId, world, inspectPage)
    }
    styledFrames.add(key)
  }
  update({ appearance: await appearance(tabId, world, page), tabUrl: page.href, tabTitle: page.title, viewport: { width: page.width, height: page.height } })
}

async function openView() {
  const tabId = state.tabId ?? await setTarget()
  if (!state.appliedProfile) throw new Error(t("Elegí un modelo de celular antes de abrir el marco."))
  if (state.inline) { await refreshView(); return }
  const original = await evaluate(tabId, { frameId: 0 }, inspectPage)
  await setFrameRule(tabId, original.href)
  const settings = (await getPreferences()).emulation
  try { await startEmulation(tabId, state.appliedProfile, settings) }
  catch (error) { await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [RULE_ID] }); throw error }
  update({ inline: true, emulation: settings, error: undefined })
  try {
    await evaluate(tabId, { frameId: 0 }, mountInlineView, chrome.runtime.getURL(`simulator.html?inline=1&source=${encodeURIComponent(original.href)}`), t("Vista de celular de Encuadre"))
    const deadline = Date.now() + 15000
    for (;;) {
      try {
        const world = await context(tabId)
        const page = await evaluate(tabId, world, inspectPage)
        if (/^https?:/.test(page.href) && page.readyState !== "loading") break
      } catch { /* Wait for the embedded page to create its document. */ }
      if (Date.now() >= deadline) throw new Error(t("La página del celular no respondió. Volvé a intentar abrir el marco."))
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    await configureEmulation(tabId, state.appliedProfile!, settings)
    await refreshView()
    update({ message: t("Celular abierto en esta pestaña") })
  } catch (error) { await closeView(); throw error }
}

async function apply(profile: Profile | null, scale: number | "fit") {
  if (profile && !validDimensions(profile.width, profile.height)) throw new Error(t("El tamaño debe estar entre 240 y 3840 píxeles enteros."))
  const tabId = state.tabId ?? await setTarget()
  if (!profile) {
    await closeView()
    const page = await evaluate(tabId, { frameId: 0 }, inspectPage)
    update({ viewport: { width: page.width, height: page.height }, message: t("Vista de escritorio restaurada") })
    return
  }
  update({ appliedProfile: profile, previewScale: scale, scale: typeof scale === "number" ? scale : 1, viewport: deviceViewport(profile), error: undefined })
  if (!state.inline) await openView()
  else if (state.emulation) {
    await configureEmulation(tabId, profile, state.emulation)
    const expected = deviceViewport(profile), deadline = Date.now() + 5000
    for (;;) {
      const page = await evaluate(tabId, await context(tabId), inspectPage)
      if (page.width === expected.width && page.height === expected.height) break
      if (Date.now() > deadline) throw new Error(t("El tamaño del celular no se pudo aplicar. Volvé a abrir la vista."))
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    await refreshView()
  }
}

async function control(action: CaptureControl["action"], options: Pick<CaptureControl, "density" | "x" | "y"> = {}): Promise<CaptureRect> {
  if (state.tabId === undefined) throw new Error(t("La pestaña de origen se cerró."))
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const reply: CaptureControlReply = await Promise.race([
      chrome.runtime.sendMessage({ type: "capture-control", tabId: state.tabId, action, ...options } satisfies CaptureControl),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error(t("Se interrumpió la captura porque la vista dejó de responder. Volvé a la pestaña del sitio y repetila."))), 3000) }),
    ])
    if (!reply?.ok) throw new Error(reply?.error ?? t("La vista del celular se cerró."))
    return reply.rect
  } finally { clearTimeout(timeout) }
}

function checkCancelled() { if (cancelled) throw new Error("cancelled") }

async function visibleData(tabId: number) {
  const tab = await chrome.tabs.get(tabId)
  const [active] = await chrome.tabs.query({ active: true, windowId: tab.windowId })
  if (active?.id !== tabId) throw new Error(t("Se interrumpió la captura porque cambiaste de pestaña. Volvé al sitio y repetila."))
  const delay = Math.max(0, lastShot + 550 - Date.now())
  if (delay) await new Promise(resolve => setTimeout(resolve, delay))
  checkCancelled()
  const [current] = await chrome.tabs.query({ active: true, windowId: tab.windowId })
  if (current?.id !== tabId) throw new Error(t("Se interrumpió la captura porque cambiaste de pestaña. Volvé al sitio y repetila."))
  lastShot = Date.now()
  return chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" })
}

async function visibleBitmap(tabId: number) {
  return createImageBitmap(await (await fetch(await visibleData(tabId))).blob())
}

async function surfaceScreenshot(tabId: number, clip: { x: number; y: number; width: number; height: number; scale: number }): Promise<string> {
  checkCancelled()
  const tab = await chrome.tabs.get(tabId)
  const [active] = await chrome.tabs.query({ active: true, windowId: tab.windowId })
  if (active?.id !== tabId && (pendingResultTab === undefined || active?.id !== pendingResultTab)) throw new Error(t("Se interrumpió la captura porque cambiaste de pestaña. Volvé al sitio y repetila."))
  const result = await chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", {
    format: "png", fromSurface: true, captureBeyondViewport: false, clip,
  })
  checkCancelled()
  const [current] = await chrome.tabs.query({ active: true, windowId: tab.windowId })
  if (current?.id !== tabId && (pendingResultTab === undefined || current?.id !== pendingResultTab)) throw new Error(t("Se interrumpió la captura porque cambiaste de pestaña. Volvé al sitio y repetila."))
  if (!result || !("data" in result) || typeof result.data !== "string") throw new Error(t("No se pudo generar la imagen del celular."))
  return `data:image/png;base64,${result.data}`
}

async function viewportBitmap(tabId: number, world: World, page: PageInfo, density: number, warnings: string[]) {
  const width = Math.max(1, Math.floor(page.width * density)), height = Math.max(1, Math.floor(page.height * density))
  const canvas = new OffscreenCanvas(width, height), drawing = canvas.getContext("2d")
  if (!drawing) throw new Error(t("No se pudo preparar la imagen."))
  if (!state.inline) {
    const bitmap = await visibleBitmap(tabId)
    try { drawing.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, width, height) }
    finally { bitmap.close() }
  } else {
    const rect = await control("read")
    if (await evaluate(tabId, world, waitForVisibleResources, { x: 0, y: 0, width: page.width, height: page.height })) {
      const warning = t("Se agotó la espera de algún recurso visible; puede faltar una imagen.")
      if (!warnings.includes(warning)) warnings.push(warning)
    }
    const root = await evaluate(tabId, { frameId: 0 }, inspectPage)
    // Render at the requested pixel size before taking the screenshot. Merely
    // enlarging captureVisibleTab's bitmap produces a soft, upscaled image.
    const data = await surfaceScreenshot(tabId, {
      x: rect.x + root.x, y: rect.y + root.y, width: rect.width, height: rect.height,
      scale: density / (rect.width / page.width),
    })
    const bitmap = await createImageBitmap(await (await fetch(data)).blob())
    try { drawing.drawImage(bitmap, 0, 0, width, height) }
    finally { bitmap.close() }
  }
  return createImageBitmap(canvas)
}

async function capture(kind: "visible" | "full") {
  const tabId = state.tabId
  if (tabId === undefined) return
  inputRevision++
  cancelled = false
  interruption = undefined
  navigationInterrupted = false
  let world: World | undefined
  let record: CaptureRecord | undefined
  let failure: unknown
  const captureId = crypto.randomUUID()
  update({ stage: "preparing", progress: 5, error: undefined, resultId: undefined, message: t("Preparando fuentes e imágenes…") })
  try {
    const tab = await chrome.tabs.get(tabId)
    if (!tab.active) await chrome.tabs.update(tabId, { active: true })
    world = await context(tabId)
    if (state.emulation && state.appliedProfile) await configureEmulation(tabId, state.appliedProfile, state.emulation)
    checkCancelled()
    if (state.emulation) await chrome.debugger.sendCommand({ tabId }, "Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] }).catch(() => {})
    await evaluate(tabId, world, stitchChrome, false)
    await evaluate(tabId, world, restorePage)
    if (!state.inline) await chrome.scripting.insertCSS({ target: { tabId, frameIds: [world.frameId] }, css: SCROLLBAR_CSS, origin: "USER" })
    const original = await evaluate(tabId, world, inspectPage)
    if (original.width < 1 || original.height < 1) throw new Error(t("El panel no está visible. Abrilo y volvé a capturar."))
    if (state.inline) {
      const root = await evaluate(tabId, { frameId: 0 }, inspectPage)
      resultTab = pendingResultTab = (await chrome.tabs.create({ windowId: tab.windowId, url: chrome.runtime.getURL(`result.html?id=${captureId}&pending=1`) })).id
      update({})
      const rasterDensity = Math.min(state.emulation?.density ?? 2, 16000 / original.width, 16000 / original.height, Math.sqrt(24_000_000 / (original.width * original.height)))
      const rect = await control("begin", { density: rasterDensity })
      await evaluate(tabId, { frameId: 0 }, sizeInlineCapture, Math.max(root.width, rect.width + 32), Math.max(root.height, rect.height + 32))
      await chrome.debugger.sendCommand({ tabId }, "Emulation.setDeviceMetricsOverride", {
        width: Math.ceil(Math.max(root.width, rect.width + 32)), height: Math.ceil(Math.max(root.height, rect.height + 32)),
        deviceScaleFactor: 1, mobile: false,
      })
      await control("read")
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    const profile = state.appliedProfile ?? null
    const colors = await appearance(tabId, world, original, true)
    const warnings: string[] = []
    if ((await evaluate(tabId, world, preparePage)).timedOut) warnings.push(t("Se agotó la espera de fuentes o imágenes; puede faltar algún recurso."))
    checkCancelled()
    let height = original.height, partial = false
    if (kind === "full") {
      const start = Date.now()
      let y = 0, finalHeight = original.contentHeight
      for (;;) {
        checkCancelled()
        if (Date.now() - start >= 20000 || y >= 30000) { partial = true; break }
        update({ stage: "scrolling", progress: Math.min(75, 10 + 65 * y / Math.max(finalHeight, 1)), message: t("Preparando la página · {pixels} px", { pixels: formatNumber(Math.round(y)) }) })
        const step = await evaluate(tabId, world, scrollPage, y)
        finalHeight = step.height; height = Math.min(finalHeight, 30000)
        if (step.y + step.viewport >= finalHeight - 2) {
          await new Promise(resolve => setTimeout(resolve, 250))
          const settled = await evaluate(tabId, world, inspectPage)
          if (settled.contentHeight <= finalHeight) break
          finalHeight = settled.contentHeight
        }
        y += Math.max(100, Math.floor(step.viewport * .85))
      }
      if (partial) { height = Math.min(height, Math.max(original.height, y), 30000); warnings.push(t("Captura parcial: se alcanzó el límite de 20 segundos o 30.000 píxeles de recorrido.")) }
      await evaluate(tabId, world, scrollPage, 0)
      warnings.push(t("El contenido que cambia mientras se captura (videos, animaciones o listas virtuales) puede diferir de la página original."))
    }
    const current = await evaluate(tabId, world, inspectPage)
    if (current.timeOrigin !== original.timeOrigin || current.href !== original.href) throw new Error(t("La página cambió durante la captura. Volvé a intentarlo."))
    if (current.width !== original.width) throw new Error(t("El ancho de la ventana cambió durante la captura. Volvé a intentarlo."))
    if (current.height !== original.height) {
      // Chrome's debugger infobar can disappear while preparing a desktop
      // capture. With unchanged width the segments can use the settled height.
      original.height = current.height
      if (kind === "visible") { height = current.height; original.y = current.y }
      else if (!partial) height = Math.min(30000, current.contentHeight)
      warnings.push(t("El alto visible cambió durante la preparación; se usó el nuevo alto."))
    }
    const limits = await evaluate(tabId, world, limitations)
    if (limits.iframes) warnings.push(t("Los marcos incrustados incluyen solo el contenido que tienen visible."))
    if (limits.nestedScroll) warnings.push(t("Los paneles con desplazamiento interno incluyen solo su parte visible."))
    if (limits.virtualized) { partial = true; warnings.push(t("Se detectó una lista virtual: su contenido completo podría no estar disponible.")) }
    if (limits.horizontalOverflow) warnings.push(t("Hay contenido que desborda el ancho de la página; la captura respeta el ancho seleccionado."))
    let bounds = outputSize(original.width, height)
    let density = kind === "visible" && profile && frameAsset(profile) ? Math.min(2, 16000 / original.width, 16000 / height, Math.sqrt(24_000_000 / (original.width * height))) : bounds.scale
    if (state.emulation) density = Math.min(state.emulation.density, 16000 / original.width, 16000 / height, Math.sqrt(24_000_000 / (original.width * height)))
    update({ stage: "capturing", progress: 82, message: t("Generando la imagen…") })
    if (state.inline) {
      await evaluate(tabId, world, waitForVisibleResources, { x: 0, y: 0, width: original.width, height: original.height })
      await evaluate(tabId, world, scrollPage, kind === "visible" ? original.y : 0)
      if (kind === "full") {
        const settled = await evaluate(tabId, world, inspectPage)
        height = partial ? Math.min(height, settled.contentHeight) : Math.min(30000, settled.contentHeight)
        bounds = outputSize(original.width, height)
        density = Math.min(state.emulation?.density ?? 2, 16000 / original.width, 16000 / height, Math.sqrt(24_000_000 / (original.width * height)))
      }
    }
    if (bounds.scale < 1) warnings.push(t("La imagen se redujo al {percent} % para respetar los límites de memoria y dimensiones.", { percent: formatNumber(Math.round(bounds.scale * 100)) }))
    const canvas = new OffscreenCanvas(Math.max(1, Math.floor(original.width * density)), Math.max(1, Math.floor(height * density)))
    const drawing = canvas.getContext("2d")
    if (!drawing) throw new Error(t("No se pudo preparar la imagen."))
    let writtenRows = 0
    while (writtenRows < canvas.height) {
      checkCancelled()
      const written = writtenRows / density
      const position = kind === "full" ? await evaluate(tabId, world, scrollPage, Math.min(written, Math.max(0, height - original.height))) : { y: original.y }
      if (written > 0) await evaluate(tabId, world, stitchChrome, true)
      const offset = kind === "full" ? Math.max(0, written - position.y) : 0
      const take = Math.min(original.height - offset, height - written)
      const rows = Math.min(canvas.height - writtenRows, Math.round(take * density))
      if (rows <= 0) throw new Error(t("La página cambió de altura durante la captura. Volvé a intentarlo."))
      const bitmap = await viewportBitmap(tabId, world, original, density, warnings)
      try { drawing.drawImage(bitmap, 0, offset / original.height * bitmap.height, bitmap.width, take / original.height * bitmap.height, 0, writtenRows, canvas.width, rows) }
      finally { bitmap.close() }
      writtenRows += rows
      update({ progress: 82 + 10 * writtenRows / canvas.height, message: t("Generando la imagen · {percent} %", { percent: formatNumber(Math.round(100 * writtenRows / canvas.height)) }) })
    }
    checkCancelled()
    record = { id: captureId, blob: await canvas.convertToBlob({ type: "image/png" }), width: canvas.width, height: canvas.height, appearance: colors, cssWidth: original.width, cssHeight: height, profile, url: original.href, title: original.title, tabId, createdAt: new Date().toISOString(), kind, warnings, partial }
  } catch (error) { failure = error }
  finally {
    if (state.inline) {
      await evaluate(tabId, { frameId: 0 }, sizeInlineCapture).catch(() => {})
      if (state.appliedProfile && state.emulation) {
        await chrome.debugger.sendCommand({ tabId }, "Emulation.clearDeviceMetricsOverride").catch(() => {})
        await configureEmulation(tabId, state.appliedProfile, state.emulation).catch(() => {})
      }
      await control("end").catch(() => {})
    }
    if (world) {
      try { await evaluate(tabId, world, stitchChrome, false); await evaluate(tabId, world, restorePage) } catch { if (record) record.warnings.push(t("La página cambió y no se pudo restaurar su posición anterior.")) }
      if (!state.inline) await chrome.scripting.removeCSS({ target: { tabId, frameIds: [world.frameId] }, css: SCROLLBAR_CSS, origin: "USER" }).catch(() => {})
    }
    if (navigationInterrupted) await closeView().catch(() => {})
  }
  if (failure || cancelled || !record) {
    const stopped = cancelled && !interruption
    update({ stage: stopped ? "cancelled" : "error", progress: 0, error: stopped ? undefined : interruption ?? describeError(failure), message: stopped ? t("Captura cancelada. Se restauró la página.") : t("No se pudo capturar") })
    pendingResultTab = undefined
    return
  }
  try {
    update({ stage: "saving", progress: 95, message: t("Abriendo el resultado…") })
    await saveCapture(record)
    checkCancelled()
    if (pendingResultTab === undefined) resultTab = (await chrome.tabs.create({ url: chrome.runtime.getURL(`result.html?id=${record.id}`) })).id
    update({ stage: "done", progress: 100, resultId: record.id, message: record.partial ? t("Captura parcial lista para revisar") : t("Captura lista") })
    pendingResultTab = undefined
  } catch (error) {
    await clearCaptures().catch(() => {})
    pendingResultTab = undefined
    update({ stage: cancelled ? "cancelled" : "error", progress: 0, error: cancelled ? undefined : describeError(error), message: t("No se pudo guardar el resultado") })
  }
}

function parseRequest(value: unknown): Request {
  if (!value || typeof value !== "object" || !("type" in value)) throw new Error(t("Solicitud inválida"))
  const request = value as Record<string, unknown>
  if (request.type === "emulation" && isEmulationSettings(request.settings)) return request as Request
  if (request.type === "reload-emulator") return request as Request
  if (["state", "show-result", "cancel", "simulator", "inline-refresh"].includes(String(request.type))) return request as Request
  if (request.type === "target" && (request.tabId === undefined || Number.isInteger(request.tabId))) return request as Request
  if (request.type === "capture" && ["visible", "full"].includes(String(request.kind)) && (request.tabId === undefined || Number.isInteger(request.tabId))) return request as Request
  if (request.type === "return" && Number.isInteger(request.tabId) && (request.repeat === undefined || typeof request.repeat === "boolean") && (request.kind === undefined || ["visible", "full"].includes(String(request.kind)))) return request as Request
  if (request.type === "apply" && (request.scale === "fit" || (typeof request.scale === "number" && request.scale >= .25 && request.scale <= 1))) {
    const p = request.profile
    if (p === null || (p && typeof p === "object" && "width" in p && "height" in p && "id" in p && "name" in p && "kind" in p && typeof p.width === "number" && typeof p.height === "number" && validDimensions(p.width, p.height) && typeof p.id === "string" && typeof p.name === "string" && ["phone", "tablet", "desktop", "custom"].includes(String(p.kind)))) return request as Request
  }
  throw new Error(t("Solicitud inválida"))
}

chrome.runtime.onMessage.addListener((raw: unknown, sender, respond: (reply: Reply) => void) => {
  if (raw && typeof raw === "object" && "type" in raw && raw.type === "emulator-touch") {
    if (sender.id !== chrome.runtime.id || sender.tab?.id !== state.tabId || sender.frameId !== touchFrame || !state.inline || !state.emulation?.touch || isBusy(state.stage)) return
    const event = raw as Record<string, unknown>
    if (!["start", "move", "end", "cancel"].includes(String(event.phase)) || typeof event.x !== "number" || typeof event.y !== "number" || !Number.isFinite(event.x) || !Number.isFinite(event.y)) return
    const revision = inputRevision
    const tabId = state.tabId!, phase = String(event.phase), x = event.x, y = event.y
    touchSequence = touchSequence.catch(() => {}).then(async () => {
      if (!state.inline || state.tabId !== tabId || !state.emulation?.touch || isBusy(state.stage)) return
      const point = await control("input", { x, y })
      if (revision !== inputRevision || !state.inline || state.tabId !== tabId || !state.emulation?.touch || isBusy(state.stage)) return
      await chrome.debugger.sendCommand({ tabId }, "Input.dispatchTouchEvent", { type: { start: "touchStart", move: "touchMove", end: "touchEnd", cancel: "touchCancel" }[phase], touchPoints: phase === "end" || phase === "cancel" ? [] : [{ x: point.x, y: point.y, radiusX: 1, radiusY: 1, force: 1 }] })
    })
    void touchSequence.then(() => respond({ ok: true, state }), error => respond({ ok: false, error: describeError(error) }))
    return true
  }
  if (raw && typeof raw === "object" && "type" in raw && raw.type === "capture-control") return
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(""))) return
  void (async () => {
    await ready
    if (sender.frameId && sender.frameId > 0 && sender.tab?.id !== state.tabId) throw new Error(t("Esta vista no está conectada a la pestaña elegida."))
    const request = parseRequest(raw)
    if (request.type === "state") return respond({ ok: true, state })
    if (request.type === "inline-refresh") {
      if (!changing && !isBusy(state.stage)) await refreshView()
      return respond({ ok: true, state })
    }
    if (request.type === "cancel") { cancelled = true; return respond({ ok: true, state }) }
    if (changing || isBusy(state.stage)) throw new Error(t("Esperá a que termine la operación o cancelala."))
    changing = true
    try {
      switch (request.type) {
        case "show-result": {
          if (!state.resultId) throw new Error(t("La captura ya no está disponible. Volvé a capturar la página."))
          const url = chrome.runtime.getURL(`result.html?id=${state.resultId}`)
          const tab = resultTab === undefined ? undefined : await chrome.tabs.get(resultTab).catch(() => undefined)
          const currentUrl = tab?.url ? new URL(tab.url) : undefined
          currentUrl?.searchParams.delete("pending")
          if (currentUrl?.href === url && tab?.id !== undefined) {
            await chrome.windows.update(tab.windowId, { focused: true })
            await chrome.tabs.update(tab.id, { active: true })
          } else {
            resultTab = (await chrome.tabs.create({ url })).id
            update({})
          }
          break
        }
        case "target": await setTarget(request.tabId); break
        case "emulation": {
          if (!state.inline || state.tabId === undefined || !state.appliedProfile) throw new Error(t("Abrí la vista de celular primero."))
          inputRevision++
          await configureEmulation(state.tabId, state.appliedProfile, request.settings)
          update({ emulation: request.settings })
          await configureTouchInput(state.tabId, await context(state.tabId), request.settings.touch)
          break
        }
        case "reload-emulator": {
          if (!state.inline || state.tabId === undefined) throw new Error(t("Abrí la vista de celular primero."))
          await evaluate(state.tabId, await context(state.tabId), () => location.reload())
          break
        }
        case "apply": await apply(request.profile, request.scale); break
        case "simulator": await openView(); break
        case "capture":
          if (request.tabId !== undefined || state.tabId === undefined) await setTarget(request.tabId)
          update({ stage: "preparing", progress: 0, error: undefined, message: t("Iniciando captura…") })
          void capture(request.kind)
          break
        case "return":
          await chrome.windows.update((await chrome.tabs.get(request.tabId)).windowId, { focused: true })
          await chrome.tabs.update(request.tabId, { active: true })
          if (request.tabId === state.tabId && state.inline && state.appliedProfile && state.emulation) await configureEmulation(request.tabId, state.appliedProfile, state.emulation)
          if (request.repeat) {
            await setTarget(request.tabId)
            update({ stage: "preparing", progress: 0, error: undefined, message: t("Iniciando captura…") })
            void capture(request.kind ?? "full")
          }
          break
      }
      respond({ ok: true, state })
    } finally { changing = false }
  })().catch((error: unknown) => {
    const message = describeError(error)
    if (!isBusy(state.stage)) update({ error: message })
    respond({ ok: false, error: message })
  })
  return true
})

const contextActions = [
  { id: "capture-full", title: t("Capturar página completa") },
  { id: "capture-visible", title: t("Capturar pantalla") },
  { id: "open-phone", title: t("Abrir vista de celular") },
  { id: "restore-desktop", title: t("Volver a escritorio") },
] as const

chrome.runtime.onInstalled.addListener(() => {
  void chrome.contextMenus.removeAll().then(() => {
    const common: Pick<chrome.contextMenus.CreateProperties, "contexts" | "documentUrlPatterns"> = {
      contexts: ["page", "frame", "selection", "link", "editable", "image", "video", "audio"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    }
    chrome.contextMenus.create({ ...common, id: "encuadre", title: "Encuadre" })
    for (const action of contextActions) chrome.contextMenus.create({ ...common, ...action, parentId: "encuadre" })
  }).catch(error => console.error("No se pudo crear el menú de Encuadre", error))
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.id === undefined || !contextActions.some(action => action.id === info.menuItemId)) return
  const tabId = tab.id
  void ready.then(async () => {
    if (changing || isBusy(state.stage)) return
    changing = true
    try {
      // Always use the tab that owns the menu, rather than a previous target.
      await setTarget(tabId)
      switch (info.menuItemId) {
        case "open-phone": {
          const preferences = await getPreferences()
          const preferred = state.appliedProfile ?? preferences.profile
          const profile = preferred?.kind === "phone" || preferred?.kind === "tablet" ? preferred : profiles.find(profile => profile.id === "iphone-13")!
          await apply(profile, preferences.previewScale)
          break
        }
        case "restore-desktop": await apply(null, "fit"); break
        case "capture-full":
        case "capture-visible":
          update({ stage: "preparing", progress: 0, error: undefined, message: t("Iniciando captura…") })
          void capture(info.menuItemId === "capture-full" ? "full" : "visible")
          break
      }
    } finally { changing = false }
  }).catch(error => update({ stage: "error", error: describeError(error) }))
})

chrome.commands.onCommand.addListener(name => {
  if (name !== "capture-full-page") return
  void ready.then(async () => {
    if (changing || isBusy(state.stage)) return
    changing = true
    try {
      await setTarget()
      const preferences = await getPreferences()
      if (!state.appliedProfile && preferences.profile) await apply(preferences.profile, preferences.previewScale)
      update({ stage: "preparing", progress: 0, error: undefined, message: t("Iniciando captura…") })
      void capture("full")
    } finally { changing = false }
  }).catch(error => update({ stage: "error", error: describeError(error) }))
})

chrome.tabs.onRemoved.addListener(tabId => {
  void ready.then(async () => {
    if (tabId === pendingResultTab) { cancelled = true; pendingResultTab = undefined }
    if (tabId === resultTab) { resultTab = undefined; await clearCaptures(); update({ resultId: undefined }) }
    if (tabId === state.tabId) {
      const running = isBusy(state.stage)
      cancelled = running
      if (running) interruption = t("La pestaña de origen se cerró durante la captura.")
      await closeView()
      update({ tabId: undefined, ...(running ? {} : { stage: "error" as const }), error: t("La pestaña de origen se cerró.") })
    }
  }).catch(() => {})
})
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url !== undefined || change.status !== undefined) void refreshAction(tabId)
  if (tabId !== state.tabId || change.status === undefined) return
  if (isBusy(state.stage)) {
    if (change.status === "loading") { navigationInterrupted = true; interruption = t("La página cambió durante la captura. Volvé a intentarlo cuando termine de navegar."); cancelled = true }
    return
  }
  // Chrome also reports loading when the embedded mobile frame navigates.
  // A top-level navigation removes our host; check again on completion so
  // reloading the original URL is handled even if loading saw the old document.
  if (state.inline) void evaluate(tabId, { frameId: 0 }, () => !!document.getElementById("encuadre-simulator")).then(mounted => {
    if (!mounted && state.inline && state.tabId === tabId) return closeView()
  }).catch(() => {})
})
chrome.runtime.onStartup.addListener(() => {
  void ready.then(async () => {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [RULE_ID] })
    await clearCaptures(); resultTab = undefined
    update({ ...initialState, tabId: undefined, appliedProfile: null, inline: false, resultId: undefined })
  })
})

chrome.debugger.onDetach.addListener(source => {
  if (source.tabId === undefined || source.tabId !== state.tabId || !state.emulation) return
  cancelled = isBusy(state.stage)
  if (cancelled) interruption = t("La emulación se desconectó durante la captura. Volvé a abrir la vista de celular.")
  update({ emulation: undefined })
  void stopEmulation(source.tabId).then(() => closeView()).catch(() => {}).then(() => update({ message: t("Vista de escritorio restaurada") }))
})
