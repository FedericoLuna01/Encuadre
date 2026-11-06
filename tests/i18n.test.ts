import { afterEach, describe, expect, it, vi } from "vitest"
import { captureMessages } from "../src/locales/capture"
import { interfaceMessages } from "../src/locales/interface"
import { emulatorMessages } from "../src/locales/emulator"
import { commonMessages } from "../src/locales/common"
import models from "../src/lib/iphone-models.json"

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

describe("translation contracts", () => {
  it("defines shared copy once and preserves every interpolation", () => {
    const seen = new Set<string>()
    for (const catalog of [captureMessages, interfaceMessages, emulatorMessages, commonMessages]) {
      for (const [source, translation] of Object.entries(catalog)) {
        expect(seen.has(source), source).toBe(false)
        seen.add(source)
        expect(translation.trim(), source).not.toBe("")
        const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()
        expect(placeholders(translation), source).toEqual(placeholders(source))
      }
    }
    for (const model of models) for (const color of model.colors) expect(seen.has(color.name), color.name).toBe(true)
  })

  it.each(["es", "es-AR", "es-ES", "ES-mx"])("uses Spanish for %s, including the service worker", async language => {
    vi.stubGlobal("chrome", { i18n: { getUILanguage: () => language } })
    const { t, locale, formatNumber } = await import("../src/lib/i18n")
    expect(locale).toBe("es")
    expect(t("Capturar página completa")).toBe("Capturar página completa")
    expect(t("Página en {name}", { name: "iPhone" })).toBe("Página en iPhone")
    expect(formatNumber(12345)).toBe("12.345")
  })

  it("uses English as fallback and keeps interpolated values literal", async () => {
    vi.stubGlobal("chrome", { i18n: { getUILanguage: () => "de-DE" } })
    vi.stubGlobal("navigator", { language: "es-AR" })
    const { t, locale, isLocalizedMessage } = await import("../src/lib/i18n")
    expect(locale).toBe("en")
    expect(t("Capturar pantalla")).toBe("Capture visible area")
    expect(t("Página en {name}", { name: "$& <phone>" })).toBe("Page on $& <phone>")
    expect(isLocalizedMessage(t("La pestaña de origen se cerró."))).toBe(true)
    expect(isLocalizedMessage("Cannot access contents of url")).toBe(false)
  })

  it("uses the browser language in development and preserves color identifiers", async () => {
    vi.stubGlobal("chrome", undefined)
    vi.stubGlobal("navigator", { language: "en-US" })
    const { frameColors } = await import("../src/lib/device-viewport")
    const { profiles } = await import("../src/lib/model")
    const colors = frameColors(profiles.find(profile => profile.id === "iphone-15")!)
    expect(colors?.colors.find(color => color.id === "pink")?.name).toBe("Pink")
    expect(colors?.selected).toBe("pink")
  })
})
