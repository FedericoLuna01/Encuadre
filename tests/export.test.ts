import { describe, expect, it } from "vitest"
import { PDFDocument, PageSizes } from "pdf-lib"
import { exportPdf } from "../src/lib/export"
import { defaultPdfOptions, parsePdfOptions } from "../src/lib/model"

describe("PDF downloads", () => {
  it.each([
    ["iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4AWP8DwQMQAAAGfgD/g8w4HYAAAAASUVORK5CYII=", 0.5],
    ["iVBORw0KGgoAAAANSUhEUgAAAAIAAAAICAYAAADTLS5CAAAAHklEQVR4AS3BsQEAAAiAIPP/n6tBmH08iUQikUgkBxeBBAxuJ26mAAAAAElFTkSuQmCC", 4],
  ])("keeps the complete image on one page with matching proportions", async (png, ratio) => {
    const output = await exportPdf(new Blob([Buffer.from(png, "base64")], { type: "image/png" }), "Menú del día", { ...defaultPdfOptions, layout: "single" })
    expect(output.type).toBe("application/pdf")
    const pdf = await PDFDocument.load(await output.arrayBuffer())
    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getTitle()).toBe("Menú del día")
    const page = pdf.getPage(0)
    expect(page.getWidth()).toBe(PageSizes.A4[0])
    expect(page.getHeight()).toBeCloseTo(page.getWidth() * ratio)
  })
  it.each(["portrait", "landscape"] as const)("paginates A4 %s with configurable margins", async orientation => {
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAAICAYAAADTLS5CAAAAHklEQVR4AS3BsQEAAAiAIPP/n6tBmH08iUQikUgkBxeBBAxuJ26mAAAAAElFTkSuQmCC"
    const output = await exportPdf(new Blob([Buffer.from(png, "base64")]), "Página larga", { layout: "paged", orientation, margin: 20 })
    const pdf = await PDFDocument.load(await output.arrayBuffer())
    const [width, height] = orientation === "portrait" ? PageSizes.A4 : [...PageSizes.A4].reverse()
    const margin = 20 * 72 / 25.4
    expect(pdf.getPageCount()).toBe(Math.ceil((width - 2 * margin) * 4 / (height - 2 * margin)))
    for (const page of pdf.getPages()) {
      expect(page.getWidth()).toBe(width)
      expect(page.getHeight()).toBe(height)
    }
  })
  it("validates old and unknown PDF preferences", () => {
    expect(parsePdfOptions(undefined)).toEqual(defaultPdfOptions)
    expect(parsePdfOptions({ layout: "bad", orientation: "bad", margin: NaN })).toEqual(defaultPdfOptions)
    expect(parsePdfOptions({ layout: "single", orientation: "landscape", margin: 90 })).toEqual({ layout: "single", orientation: "landscape", margin: 30 })
    expect(parsePdfOptions({ margin: -5 }).margin).toBe(0)
  })
})
