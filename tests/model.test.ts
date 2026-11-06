import { describe, expect, it } from "vitest"
import { filename, outputSize, parsePreferences, profiles, validDimensions } from "../src/lib/model"

describe("bounded image output", () => {
  it("keeps ordinary screenshots at their CSS dimensions", () => {
    expect(outputSize(390, 9000)).toEqual({ width: 390, height: 9000, scale: 1 })
  })
  it("bounds both dimensions and pixel memory while preserving the aspect ratio", () => {
    for (const [width, height] of [[3840, 30000], [390, 30000], [16000, 16000]]) {
      const size = outputSize(width, height)
      expect(size.width).toBeLessThanOrEqual(16000)
      expect(size.height).toBeLessThanOrEqual(16000)
      expect(size.width * size.height).toBeLessThanOrEqual(24_000_000)
      expect(Math.abs(size.width / size.height - width / height)).toBeLessThan(0.001)
    }
  })
})

describe("untrusted saved preferences", () => {
  it("preserves PDF as the selected download format", () => {
    expect(parsePreferences({ format: "pdf" }).format).toBe("pdf")
  })
  it("migrates earlier generic devices without losing rotation or custom sizes", () => {
    const p = parsePreferences({ profile: { id: "phone", name: "Teléfono", width: 844, height: 390, kind: "phone" } })
    expect(p.profile).toMatchObject({ id: "iphone-13", name: "iPhone 13", width: 844, height: 390 })
    const tablet = parsePreferences({ profile: { id: "tablet", name: "Tablet", width: 768, height: 1024, kind: "tablet" } })
    expect(tablet.customProfiles).toContainEqual(tablet.profile)
    expect(tablet.profile?.width).toBe(768)
  })
  it("rejects invalid profiles and clamps export quality", () => {
    const parsed = parsePreferences({ profile: { width: -1 }, quality: 500, format: "svg", customProfiles: [profiles[0], { bad: true }], previewScale: 10 })
    expect(parsed.profile).toBeNull()
    expect(parsed.quality).toBe(100)
    expect(parsed.format).toBe("png")
    expect(parsed.customProfiles).toEqual([profiles[0]])
    expect(parsed.previewScale).toBe("fit")
  })
  it("rejects fractional, non-finite and oversized viewport sizes", () => {
    for (const width of [NaN, Infinity, 239, 3841, 390.1]) expect(validDimensions(width, 844)).toBe(false)
  })
})

it("produces portable names with site, profile, orientation and date", () => {
  const name = filename({ url: "https://ejemplo.com/menu?private=secret", profile: profiles[1], createdAt: "2026-11-03T23:00:00.000Z" }, "jpeg")
  expect(name).toMatch(/^ejemplo-com-iPhone-13-vertical-2026-11-03T23-00-00-000Z.jpg$/)
  expect(name).not.toContain("secret")
})
