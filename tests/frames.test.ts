import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import assets from "../src/lib/frame-assets.json"
import models from "../src/lib/iphone-models.json"
import { frameAsset, frameColors, deviceInsets } from "../src/lib/device-viewport"
import { frameGeometry } from "../src/lib/device-frame"
import { parsePreferences, profiles } from "../src/lib/model"
import { profileGroups } from "../src/lib/profile-groups"

describe("iPhone frame catalog", () => {
  it("groups generations from newest to oldest and keeps each family's variants together", () => {
    const groups = profileGroups([])
    expect(groups.map(group => group.label)).toEqual(["iPhone 18", "iPhone 17", "iPhone 16", "iPhone 15", "iPhone 14", "iPhone 13", "iPhone 12", "iPhone 11", "iPhone X / XR / XS", "iPhone SE", "Android", "Tablets"])
    expect(groups.find(group => group.label === "iPhone 15")?.profiles.map(p => p.id)).toEqual(["iphone-15", "iphone-15-plus", "iphone-15-pro", "iphone-15-pro-max"])
    expect(groups.find(group => group.label === "iPhone 13")?.profiles.map(p => p.id)).toEqual(["iphone-13", "iphone-13-mini", "iphone-13-pro", "iphone-13-pro-max"])
    const custom = { id: "custom-phone", name: "Mi teléfono", width:400, height:800, kind:"custom" as const }
    expect(profileGroups([custom]).at(-1)?.profiles).toEqual([custom])
  })
  it("includes the five real iPhone 15 finishes and defaults to pink", () => {
    const profile = profiles.find(p => p.id === "iphone-15")!
    expect(frameColors(profile)?.selected).toBe("pink")
    expect(frameColors(profile)?.colors.map(c => c.id).sort()).toEqual(["black", "blue", "green", "pink", "yellow"])
    expect(frameAsset({ ...profile, color: "unknown" })).toEqual(frameAsset(profile))
  })

  it("resolves every finish in both orientations to bundled images with valid screen bounds", () => {
    expect(new Set(models.map(model => model.id)).size).toBe(models.length)
    for (const model of models) {
      const profile = profiles.find(p => p.id === model.id)!
      expect(profile, model.id).toBeDefined()
      expect(model.colors.some(color => color.id === model.defaultColor)).toBe(true)
      for (const color of model.colors) for (const landscape of [false, true]) {
        const rotated = { ...profile, color: color.id, width: landscape ? model.height : model.width, height: landscape ? model.width : model.height }
        const asset = frameAsset(rotated)!
        expect(asset, `${model.id}/${color.id}`).toBeTruthy()
        expect(frameGeometry(rotated).contentHeight).toBeGreaterThan(0)
        expect(asset.screen.x).toBeGreaterThan(0)
        expect(asset.screen.y).toBeGreaterThan(0)
        expect(asset.screen.x + asset.screen.width).toBeLessThan(asset.width)
        expect(asset.screen.y + asset.screen.height).toBeLessThan(asset.height)
      }
    }
    // Check even non-default source images; a valid catalog must be fully offline.
    for (const asset of Object.values(assets)) for (const oriented of [asset, asset.landscape]) for (const path of [oriented.frame, oriented.mask]) {
      const png = readFileSync(`public${path}`)
      expect(png.subarray(1,4).toString()).toBe("PNG")
      expect(png.readUInt32BE(16)).toBe(oriented.width)
      expect(png.readUInt32BE(20)).toBe(oriented.height)
    }
  })

  it("preserves color and rotation in preferences and uses the right system bars for older models", () => {
    const profile = { ...profiles.find(p => p.id === "iphone-15")!, color: "yellow", width:852, height:393 }
    expect(parsePreferences({ profile }).profile).toEqual(profile)
    expect(parsePreferences({ profile: { ...profile, color: 42 } }).profile).toBeNull()
    expect(deviceInsets(profiles.find(p => p.id === "iphone-se")!)).toEqual({top:20,bottom:0})
    expect(deviceInsets(profiles.find(p => p.id === "iphone-13")!)).toEqual({top:47,bottom:34})
  })
})
