// Self-contained operations injected into the original page.
export function mountInlineView(controlsUrl: string, title: string) {
  const scope = globalThis as typeof globalThis & { __encuadreView?: { cleanup: () => void } }
  if (scope.__encuadreView) return
  const host = document.createElement("div")
  host.id = "encuadre-simulator"
  host.style.cssText = "all:initial!important;position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:2147483647!important;display:block!important;color-scheme:light!important"
  const root = host.attachShadow({ mode: "closed" })
  const iframe = document.createElement("iframe")
  iframe.name = "encuadre-controls"; iframe.title = title
  iframe.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0;background:#252725;display:block"
  iframe.src = controlsUrl
  root.append(iframe)
  const style = document.createElement("style")
  style.textContent = "html { overflow:hidden!important; }"
  const bodyInert = document.body?.inert ?? false
  const originalX = scrollX, originalY = scrollY
  if (document.body) document.body.inert = true
  document.documentElement.append(style, host)
  function cleanup() {
    host.remove(); style.remove()
    if (document.body) document.body.inert = bodyInert
    scrollTo({ left: originalX, top: originalY, behavior: "instant" })
    delete scope.__encuadreView
    removeEventListener("message", close)
  }
  scope.__encuadreView = { cleanup }
  // Only the extension frame can request the fallback cleanup.
  function close(event: MessageEvent<unknown>) {
    if (event.source !== iframe.contentWindow || event.origin !== controlsUrl.split("/").slice(0, 3).join("/") || event.data !== "encuadre-close") return
    cleanup()
  }
  addEventListener("message", close)
}

export function unmountInlineView() {
  const scope = globalThis as typeof globalThis & { __encuadreView?: { cleanup: () => void } }
  scope.__encuadreView?.cleanup()
}

// Extend only the extension's surface, leaving the mobile CSS viewport intact.
export function sizeInlineCapture(width?: number, height?: number) {
  const host = document.getElementById("encuadre-simulator")
  if (!host) return
  host.style.setProperty("width", width === undefined ? "100vw" : `${Math.ceil(width)}px`, "important")
  host.style.setProperty("height", height === undefined ? "100vh" : `${Math.ceil(height)}px`, "important")
  host.getBoundingClientRect()
}
