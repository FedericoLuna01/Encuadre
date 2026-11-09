import { describe, expect, it } from "vitest"
import { adjustCrop, type CropHandle } from "../src/lib/editor"

describe("crop geometry in source pixels", () => {
  const bounds = { x: 20, y: 40, width: 800, height: 600 }
  const box = { x: 120, y: 140, width: 400, height: 300 }
  it("moves without changing dimensions and clamps to an already cropped image", () => {
    expect(adjustCrop(box, "move", { x: -1000, y: 1000 }, bounds)).toEqual({ x: 20, y: 340, width: 400, height: 300 })
  })
  it.each(["n", "s", "e", "w", "nw", "ne", "sw", "se"] as CropHandle[])("keeps %s within the source and at least one pixel wide and tall", handle => {
    for (const delta of [{ x: -10000, y: -10000 }, { x: 10000, y: 10000 }]) {
      const result = adjustCrop(box, handle, delta, bounds)
      expect(result.x).toBeGreaterThanOrEqual(bounds.x)
      expect(result.y).toBeGreaterThanOrEqual(bounds.y)
      expect(result.width).toBeGreaterThanOrEqual(1)
      expect(result.height).toBeGreaterThanOrEqual(1)
      expect(result.x + result.width).toBeLessThanOrEqual(bounds.x + bounds.width)
      expect(result.y + result.height).toBeLessThanOrEqual(bounds.y + bounds.height)
    }
  })
  it("keeps the opposite corner fixed and rounds fractional zoom movements", () => {
    expect(adjustCrop(box, "nw", { x: 50.4, y: 20.8 }, bounds)).toEqual({ x: 170, y: 161, width: 350, height: 279 })
    expect(box).toEqual({ x: 120, y: 140, width: 400, height: 300 })
  })
})
