// Injected with chrome.scripting. These functions must be self-contained.
export function inspectPage() {
  return {
    width: innerWidth, height: innerHeight,
    contentHeight: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
    x: scrollX, y: scrollY, href: location.href, title: document.title,
    timeOrigin: performance.timeOrigin, dpr: devicePixelRatio, readyState: document.readyState,
    manifestUrl: document.querySelector<HTMLLinkElement>('link[rel~="manifest"]')?.href ?? "",
  }
}

export function readPageAppearance(manifest: { theme_color?: string; background_color?: string }) {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 1
  const context = canvas.getContext("2d", { willReadFrequently: true })
  function color(value: string | undefined) {
    if (!context || !value || !CSS.supports("color", value) || /var\(|currentcolor|inherit|initial|unset|revert/i.test(value)) return undefined
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = value
    context.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
    if (!a) return undefined
    return `#${[r, g, b].map(channel => channel.toString(16).padStart(2, "0")).join("")}`
  }
  const meta = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'))
    .filter(element => !element.media || matchMedia(element.media).matches)
    .map(element => color(element.content)).find(Boolean)
  const theme = meta ?? color(manifest.theme_color)
  const background = color(manifest.background_color)
    ?? color(document.body ? getComputedStyle(document.body).backgroundColor : undefined)
    ?? color(getComputedStyle(document.documentElement).backgroundColor)
    ?? theme ?? "#ffffff"
  return { themeColor: theme ?? background, backgroundColor: background }
}

export async function readPageManifest(url: string) {
  try {
    const response = await fetch(url, { credentials: "same-origin", signal: AbortSignal.timeout(2000) })
    if (!response.ok) return {}
    const raw = await response.text()
    if (raw.length > 1_000_000) return {}
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== "object") return {}
    const manifest = value as Record<string, unknown>
    return { theme_color: typeof manifest.theme_color === "string" ? manifest.theme_color : undefined, background_color: typeof manifest.background_color === "string" ? manifest.background_color : undefined }
  } catch { return {} }
}

export async function preparePage() {
  const scope = globalThis as typeof globalThis & { __encuadre?: { x: number; y: number; style: HTMLStyleElement; timer: ReturnType<typeof setTimeout>; deadline: number } }
  if (scope.__encuadre) return { timedOut: false }
  const style = document.createElement("style")
  style.textContent = "html,body,* { scroll-behavior: auto !important; scroll-snap-type: none !important; } *,*::before,*::after { animation-play-state: paused !important; caret-color: transparent !important; transition: none !important; }"
  const x = scrollX
  const y = scrollY
  // The page restores itself if the extension is interrupted during capture.
  const cleanupTimer = setInterval(() => {
    if (scope.__encuadre && Date.now() < scope.__encuadre.deadline) return
    clearInterval(cleanupTimer)
    scrollTo(x, y)
    const stitchScope = globalThis as typeof globalThis & { __encuadreStitch?: { element: HTMLElement; style: string | null }[] }
    for (const item of stitchScope.__encuadreStitch ?? []) { if (item.style === null) item.element.removeAttribute("style"); else item.element.setAttribute("style", item.style) }
    delete stitchScope.__encuadreStitch
    style.remove()
    delete scope.__encuadre
  }, 1000)
  scope.__encuadre = { x, y, style, timer: cleanupTimer, deadline: Date.now() + 45000 }
  document.documentElement.append(style)
  const resources = Promise.allSettled([
    document.fonts.ready,
    ...Array.from(document.images).filter(image => image.loading !== "lazy").map(image => image.decode().catch(() => {})),
  ])
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = await Promise.race([
    resources.then(() => false),
    new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(true), 3500) }),
  ])
  clearTimeout(timer)
  return { timedOut }
}

export async function scrollPage(y: number) {
  const scope = globalThis as typeof globalThis & { __encuadre?: { deadline: number } }
  if (scope.__encuadre) scope.__encuadre.deadline = Date.now() + 45000
  scrollTo(0, y)
  await new Promise(resolve => setTimeout(resolve, 160))
  const visibleImages = Array.from(document.images).filter(image => {
    const rect = image.getBoundingClientRect()
    return rect.top < innerHeight && rect.bottom >= 0
  })
  await Promise.race([
    Promise.allSettled(visibleImages.map(image => image.decode())),
    new Promise(resolve => setTimeout(resolve, 400)),
  ])
  return { y: scrollY, height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0), viewport: innerHeight }
}

export async function waitForVisibleResources(area: { x: number; y: number; width: number; height: number }) {
  const images = Array.from(document.images).filter(image => {
    const rect = image.getBoundingClientRect()
    return rect.bottom > area.y && rect.top < area.y + area.height && rect.right > area.x && rect.left < area.x + area.width
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = await Promise.race([
    Promise.allSettled([document.fonts.ready, ...images.map(image => image.decode())]).then(() => false),
    new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(true), 1500) }),
  ])
  clearTimeout(timer)
  return timedOut
}

export function limitations() {
  let nestedScroll = false
  let scanned = 0
  for (const element of document.querySelectorAll("body *")) {
    if (++scanned > 12000) break
    if (element.clientHeight > 80 && element.scrollHeight > element.clientHeight + 30 && /auto|scroll/.test(getComputedStyle(element).overflowY)) {
      nestedScroll = true
      break
    }
  }
  return { iframes: document.querySelectorAll("iframe").length > 0, nestedScroll, virtualized: !!document.querySelector('[aria-rowcount], [data-virtualized], .ReactVirtualized__Grid, .virtual-scroller'), horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2 }
}

export function restorePage() {
  const scope = globalThis as typeof globalThis & { __encuadre?: { x: number; y: number; style: HTMLStyleElement; timer: ReturnType<typeof setTimeout> } }
  const saved = scope.__encuadre
  if (saved) {
    clearTimeout(saved.timer)
    scrollTo(saved.x, saved.y)
    saved.style.remove()
    delete scope.__encuadre
  }
}

export function stitchChrome(hide: boolean) {
  const scope = globalThis as typeof globalThis & { __encuadreStitch?: { element: HTMLElement; style: string | null }[] }
  if (!hide) {
    for (const { element, style } of scope.__encuadreStitch ?? []) {
      if (style === null) element.removeAttribute("style"); else element.setAttribute("style", style)
    }
    delete scope.__encuadreStitch
    return
  }
  if (scope.__encuadreStitch) return
  scope.__encuadreStitch = []
  for (const element of document.querySelectorAll<HTMLElement>("body *")) {
    const position = getComputedStyle(element).position
    if (position !== "fixed" && position !== "sticky") continue
    scope.__encuadreStitch.push({ element, style: element.getAttribute("style") })
    if (position === "fixed") element.style.setProperty("visibility", "hidden", "important")
    else element.style.setProperty("position", "relative", "important")
  }
}
