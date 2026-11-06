import { t } from "./i18n"
export interface CaptureRect {
  x: number; y: number; width: number; height: number
  sourceX: number; sourceY: number
  viewportWidth: number; viewportHeight: number; dpr: number
}

export interface CaptureControl {
  type: "capture-control"
  tabId: number
  action: "begin" | "read" | "end" | "input"
  density?: number
  x?: number
  y?: number
}

export type CaptureControlReply = { ok: true; rect: CaptureRect } | { ok: false; error: string }

export function capturePlane(message: CaptureControl): void {
  const root = document.documentElement
  if (message.action === "end") {
    root.classList.remove("inline-snapshot")
    root.style.removeProperty("--capture-density")
    return
  }
  if (message.action !== "begin") return
  root.style.setProperty("--capture-density", String(message.density ?? 2))
  root.classList.add("inline-snapshot")
}

export function readCaptureRect(): CaptureRect {
  const site = document.querySelector<HTMLIFrameElement>('iframe[name="encuadre-site"]')
  if (!site) throw new Error(t("La pantalla del celular todavía no está disponible."))
  const rect = site.getBoundingClientRect()
  if (document.documentElement.classList.contains("inline-snapshot")) return {
    x: rect.left, y: rect.top, width: rect.width, height: rect.height,
    sourceX: 0, sourceY: 0, viewportWidth: innerWidth, viewportHeight: innerHeight, dpr: devicePixelRatio,
  }
  const left = Math.max(0, rect.left), top = Math.max(0, rect.top)
  return {
    x: left, y: top, width: Math.max(0, Math.min(innerWidth, rect.right) - left), height: Math.max(0, Math.min(innerHeight, rect.bottom) - top),
    sourceX: left - rect.left, sourceY: top - rect.top,
    viewportWidth: innerWidth, viewportHeight: innerHeight, dpr: devicePixelRatio,
  }
}

export function inputPoint(x: number, y: number): CaptureRect {
  const site = document.querySelector<HTMLIFrameElement>('iframe[name="encuadre-site"]')
  if (!site) throw new Error(t("La pantalla del celular no está disponible."))
  const rect = site.getBoundingClientRect()
  return { ...readCaptureRect(), x: rect.left + x * rect.width / (Number(site.dataset.viewportWidth) || site.clientWidth), y: rect.top + y * rect.height / (Number(site.dataset.viewportHeight) || site.clientHeight) }
}
