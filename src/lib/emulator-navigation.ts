// Self-contained operation injected into each mobile document.
export function installFrameNavigation() {
  const scope = globalThis as typeof globalThis & { __encuadreNavigation?: boolean }
  if (scope.__encuadreNavigation) return
  scope.__encuadreNavigation = true

  function sameSite(address: string) {
    try {
      const url = new URL(address, document.baseURI)
      return /^https?:$/.test(url.protocol) && url.origin === location.origin
    } catch { return false }
  }

  // Keep native navigation and the site's own click handlers. Only change the
  // destination frame: _top/_parent would replace the simulator or its controls.
  addEventListener("click", event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    const link = event.composedPath().find((node): node is HTMLAnchorElement | HTMLAreaElement => node instanceof HTMLAnchorElement || node instanceof HTMLAreaElement)
    if (!link || link.hasAttribute("download") || !sameSite(link.href)) return
    const target = link.target || document.querySelector("base[target]")?.getAttribute("target") || "_self"
    if (target !== "_self") link.target = "_self"
  }, true)

  addEventListener("submit", event => {
    const form = event.target
    if (!(form instanceof HTMLFormElement)) return
    const button = event.submitter
    const override = button instanceof HTMLButtonElement || button instanceof HTMLInputElement ? button : null
    const address = override?.hasAttribute("formaction") ? override.formAction : form.action
    if (!sameSite(address)) return
    form.target = "_self"
    if (override?.hasAttribute("formtarget")) override.formTarget = "_self"
  }, true)
}
