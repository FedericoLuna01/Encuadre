import { t } from "./i18n"
export const AVAILABLE_TITLE = t("Encuadre · Capturar y probar tamaños")

/** Shared by the toolbar and capture entry points. */
export function pageUnavailableReason(value?: string): string | undefined {
  if (!value) return t("Abrí una página web para usar Encuadre.")
  let url: URL
  try { url = new URL(value) } catch { return t("Abrí una página web para usar Encuadre.") }
  if (url.hostname === "chromewebstore.google.com" ||
    (url.hostname === "chrome.google.com" && /^\/webstore(?:\/|$)/.test(url.pathname))) {
    return t("Chrome no permite usar Encuadre en su tienda de extensiones.")
  }
  if (url.protocol === "file:") return t("Encuadre no está disponible para archivos locales. Abrí un sitio web.")
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return t("Encuadre no está disponible en esta página. Abrí un sitio web.")
  }
  return undefined
}
