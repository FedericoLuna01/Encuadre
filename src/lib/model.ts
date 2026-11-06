import { t } from "./i18n"
import iphoneModels from "./iphone-models.json"

export interface Profile {
  id: string
  name: string
  width: number
  height: number
  kind: "phone" | "tablet" | "desktop" | "custom"
  color?: string
}

export const profiles: Profile[] = [
  { id: "iphone-se", name: t("iPhone SE (2.ª generación)"), width: 375, height: 667, kind: "phone" },
  { id: "iphone-13", name: "iPhone 13", width: 390, height: 844, kind: "phone" },
  { id: "iphone-14-pro", name: "iPhone 14 Pro", width: 393, height: 852, kind: "phone" },
  { id: "iphone-15", name: "iPhone 15", width: 393, height: 852, kind: "phone" },
  { id: "iphone-15-pro", name: "iPhone 15 Pro", width: 393, height: 852, kind: "phone" },
  { id: "iphone-15-pro-max", name: "iPhone 15 Pro Max", width: 430, height: 932, kind: "phone" },
  { id: "iphone-16", name: "iPhone 16", width: 393, height: 852, kind: "phone" },
  ...iphoneModels.filter(model => !["iphone-se", "iphone-13", "iphone-14-pro", "iphone-15", "iphone-15-pro", "iphone-15-pro-max", "iphone-16"].includes(model.id)).map(model => ({ id: model.id, name: model.name, width: model.width, height: model.height, kind: "phone" as const })),
  { id: "galaxy-s24", name: "Samsung Galaxy S24", width: 360, height: 780, kind: "phone" },
  { id: "galaxy-s24-ultra", name: "Samsung Galaxy S24 Ultra", width: 384, height: 832, kind: "phone" },
  { id: "pixel-8", name: "Google Pixel 8", width: 412, height: 915, kind: "phone" },
  { id: "ipad-air", name: "iPad Air", width: 820, height: 1180, kind: "tablet" },
  { id: "desktop-hd", name: t("Escritorio HD"), width: 1440, height: 900, kind: "desktop" },
]

export type ExportFormat = "png" | "jpeg" | "pdf"
export interface PdfOptions { layout: "paged" | "single"; orientation: "portrait" | "landscape"; margin: number }
export const defaultPdfOptions: PdfOptions = { layout: "paged", orientation: "portrait", margin: 10 }
export function parsePdfOptions(value: unknown): PdfOptions {
  if (!value || typeof value !== "object") return { ...defaultPdfOptions }
  const options = value as Record<string, unknown>
  return {
    layout: options.layout === "single" ? "single" : "paged",
    orientation: options.orientation === "landscape" ? "landscape" : "portrait",
    margin: typeof options.margin === "number" && Number.isFinite(options.margin) ? Math.min(30, Math.max(0, Math.round(options.margin))) : defaultPdfOptions.margin,
  }
}

export interface EmulationSettings { density: number; userAgent: string; touch: boolean }
export const defaultEmulation: EmulationSettings = { density: 2, userAgent: "", touch: true }
export function isEmulationSettings(value: unknown): value is EmulationSettings {
  if (!value || typeof value !== "object") return false
  const p = value as Record<string, unknown>
  return typeof p.density === "number" && Number.isFinite(p.density) && p.density >= 1 && p.density <= 3 && typeof p.userAgent === "string" && p.userAgent.length <= 512 && !/[\r\n]/.test(p.userAgent) && typeof p.touch === "boolean"
}

export interface Preferences {
  pdf: PdfOptions
  emulation: EmulationSettings
  profile: Profile | null
  customProfiles: Profile[]
  format: ExportFormat
  quality: number
  previewScale: number | "fit"
}

export const defaults: Preferences = { pdf: defaultPdfOptions, emulation: defaultEmulation, profile: null, customProfiles: [], format: "png", quality: 90, previewScale: "fit" }

export function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== "object") return false
  const p = value as Record<string, unknown>
  return typeof p.id === "string" && typeof p.name === "string" && (p.color === undefined || typeof p.color === "string") && typeof p.width === "number" && typeof p.height === "number" && validDimensions(p.width, p.height) && ["phone", "tablet", "desktop", "custom"].includes(String(p.kind))
}

export function parsePreferences(value: unknown): Preferences {
  if (!value || typeof value !== "object") return { ...defaults }
  const p = value as Record<string, unknown>
  let profile = isProfile(p.profile) ? p.profile : null
  const customProfiles = Array.isArray(p.customProfiles) ? p.customProfiles.filter(isProfile) : []
  // Preserve the selected size (including rotation) when upgrading the original
  // generic presets to model names. Unmatched presets remain saved custom sizes.
  if (profile) {
    const legacy: Record<string, string> = { "phone-small": "iphone-se", phone: "iphone-13", "phone-large": "iphone-15-pro-max" }
    const oldId = profile.id
    const replacement = profiles.find(item => item.id === legacy[oldId])
    if (replacement && ((profile.width === replacement.width && profile.height === replacement.height) || (profile.width === replacement.height && profile.height === replacement.width))) profile = { ...profile, id: replacement.id, name: replacement.name }
    const selectedId = profile.id
    if (!profiles.some(item => item.id === selectedId) && !customProfiles.some(item => item.id === selectedId)) {
      profile = { ...profile, kind: "custom" }
      customProfiles.push(profile)
    }
  }
  return {
    pdf: parsePdfOptions(p.pdf),
    emulation: isEmulationSettings(p.emulation) ? p.emulation : { ...defaultEmulation },
    profile,
    customProfiles,
    format: p.format === "jpeg" || p.format === "pdf" ? p.format : "png",
    quality: typeof p.quality === "number" && Number.isFinite(p.quality) ? Math.min(100, Math.max(30, Math.round(p.quality))) : defaults.quality,
    previewScale: typeof p.previewScale === "number" && p.previewScale >= 0.25 && p.previewScale <= 1 ? p.previewScale : "fit",
  }
}

export type Stage = "idle" | "preparing" | "scrolling" | "capturing" | "saving" | "done" | "cancelled" | "error"
export interface CaptureState {
  stage: Stage
  progress: number
  message: string
  error?: string
  resultId?: string
  tabId?: number
  tabTitle?: string
  tabUrl?: string
  emulation?: EmulationSettings
  appliedProfile?: Profile | null
  scale?: number
  viewport?: { width: number; height: number }
  inline?: boolean
  appearance?: PageAppearance
  previewScale?: number | "fit"
}
export const initialState: CaptureState = { stage: "idle", progress: 0, message: t("Lista para capturar") }
export const isBusy = (stage: Stage) => ["preparing", "scrolling", "capturing", "saving"].includes(stage)

export interface CaptureRecord {
  appearance?: PageAppearance
  id: string
  blob: Blob
  width: number
  height: number
  cssWidth: number
  cssHeight: number
  profile: Profile | null
  url: string
  title: string
  tabId: number
  createdAt: string
  kind: "visible" | "full"
  warnings: string[]
  partial: boolean
}

export type Request =
  | { type: "state" }
  | { type: "show-result" }
  | { type: "simulator" }
  | { type: "emulation"; settings: EmulationSettings }
  | { type: "reload-emulator" }
  | { type: "inline-refresh" }
  | { type: "target"; tabId?: number }
  | { type: "apply"; profile: Profile | null; scale: number | "fit" }
  | { type: "capture"; kind: "visible" | "full"; tabId?: number }
  | { type: "cancel" }
  | { type: "return"; tabId: number; repeat?: boolean; kind?: "visible" | "full" }
export interface PageAppearance { themeColor: string; backgroundColor: string }
export type Reply = { ok: true; state: CaptureState } | { ok: false; error: string }

export function validDimensions(width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) && width >= 240 && width <= 3840 && height >= 240 && height <= 3840
}

export function outputSize(width: number, height: number) {
  const scale = Math.min(1, 16000 / width, 16000 / height, Math.sqrt(24_000_000 / (width * height)))
  return { scale, width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) }
}

export function filename(record: Pick<CaptureRecord, "url" | "profile" | "createdAt">, format: ExportFormat) {
  const host = new URL(record.url).hostname
  const profile = record.profile
  const orientation = profile ? (profile.width > profile.height ? "horizontal" : "vertical") : "escritorio"
  const name = `${host}-${profile?.name ?? "original"}${profile?.color ? `-${profile.color}` : ""}-${orientation}-${record.createdAt.replace(/[:.]/g, "-")}`
  return `${name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]/g, "-")}.${format === "jpeg" ? "jpg" : format}`
}
