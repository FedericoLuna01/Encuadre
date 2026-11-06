import { interfaceMessages } from "../locales/interface"
import { emulatorMessages } from "../locales/emulator"
import { captureMessages } from "../locales/capture"
import { commonMessages } from "../locales/common"

// Spanish source messages are the keys and fallback; shared copy is defined once.
export const messages = { ...captureMessages, ...interfaceMessages, ...emulatorMessages, ...commonMessages } as const
export type Message = keyof typeof messages
export type Locale = "es" | "en"
type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never
type Arguments<S extends string> = [Placeholders<S>] extends [never] ? [] : [values: Record<Placeholders<S>, string | number>]

export function resolveLocale(language: string): Locale {
  return /^es(?:-|$)/i.test(language) ? "es" : "en"
}

export const locale = resolveLocale(globalThis.chrome?.i18n?.getUILanguage?.() || globalThis.navigator?.language || "en")
const numberFormatter = new Intl.NumberFormat(locale === "es" ? "es-AR" : "en")
export const formatNumber = (value: number) => numberFormatter.format(value)

export function isStaticMessage(value: string): value is Exclude<Message, `${string}{${string}`> {
  return !value.includes("{") && Object.hasOwn(messages, value)
}

export function t<K extends Message>(source: K, ...args: Arguments<K>): string {
  const translated = locale === "es" ? source : messages[source]
  const values: Readonly<Record<string, string | number>> = args[0] ?? {}
  return translated.replace(/\{(\w+)\}/g, (placeholder, name: string) => Object.hasOwn(values, name) ? String(values[name]) : placeholder)
}

/** Recognize our own errors before interpreting browser API errors. */
const localizedMessages = new Set<string>([...Object.keys(messages), ...Object.values(messages)])
export const isLocalizedMessage = (value: string): boolean => localizedMessages.has(value)

// Runs in extension pages and the development preview, never in the service worker.
if (typeof document !== "undefined") {
  document.documentElement.lang = locale
  const result = location.pathname.endsWith("result.html")
  const simulator = location.pathname.endsWith("simulator.html")
  document.title = t(result ? "Encuadre · Resultado" : simulator ? "Encuadre · Simulador" : "Encuadre · Capturar")
  document.querySelector('meta[name="description"]')?.setAttribute("content", t(result
    ? "Revisá y exportá tu captura con Encuadre."
    : simulator ? "Probá tu página en distintos modelos de celular y tamaños con Encuadre."
      : "Capturá páginas completas y probá cómo se ven en distintos tamaños con Encuadre."))
}
