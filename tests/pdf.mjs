import { chromium } from "playwright"
import { PDFDocument, PageSizes } from "pdf-lib"
import { readFile, mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import assert from "node:assert/strict"

const origin = process.env.TEST_ORIGIN ?? "http://127.0.0.1:5175"
const browser = await chromium.launch({ channel: "chromium", headless: true })
await mkdir("test-results", { recursive: true })
try {
  const page = await browser.newPage({ locale: "es-AR", viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  await page.goto(`${origin}/result.html`)
  await page.evaluate(async () => {
    const { saveCapture } = await import("/src/lib/store.ts")
    const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 1800
    const ctx = canvas.getContext("2d")
    for (const [index, color] of ["#c81e28", "#20a040", "#2040e0"].entries()) {
      ctx.fillStyle = color; ctx.fillRect(0, index * 600, 400, 600)
      ctx.fillStyle = "white"; ctx.font = "24px sans-serif"; ctx.fillText(`Tramo ${index + 1}`, 24, index * 600 + 60)
    }
    const blob = await new Promise(resolve => canvas.toBlob(resolve))
    await saveCapture({ id: "pdf-options", blob, width: 400, height: 1800, cssWidth: 400, cssHeight: 1800, profile: null, url: "https://ejemplo.com", title: "Menú del día", tabId: 1, createdAt: new Date().toISOString(), kind: "full", warnings: [], partial: false })
  })
  await page.goto(`${origin}/result.html?id=pdf-options`)
  await page.getByText("Opciones de PDF", { exact: true }).click()
  const download = async suffix => {
    await page.getByRole("button", { name: "Más opciones de descarga" }).click()
    const next = page.waitForEvent("download")
    await page.getByRole("menuitem", { name: "Descargar PDF", exact: true }).click()
    const path = resolve(`test-results/pdf-${suffix}.pdf`)
    await (await next).saveAs(path)
    await page.getByRole("button", { name: "Descargar PDF", exact: true }).waitFor()
    return PDFDocument.load(await readFile(path))
  }
  let pdf = await download("portrait")
  assert.equal(pdf.getPageCount(), 4)
  for (const sheet of pdf.getPages()) assert.deepEqual(sheet.getSize(), { width: PageSizes.A4[0], height: PageSizes.A4[1] })
  await page.getByRole("radio", { name: "Horizontal", exact: true }).click()
  await page.getByLabel("Márgenes (mm)", { exact: true }).fill("20")
  pdf = await download("landscape")
  const margin = 20 * 72 / 25.4
  assert.equal(pdf.getPageCount(), Math.ceil(4.5 * (PageSizes.A4[1] - 2 * margin) / (PageSizes.A4[0] - 2 * margin)))
  for (const sheet of pdf.getPages()) assert.deepEqual(sheet.getSize(), { width: PageSizes.A4[1], height: PageSizes.A4[0] })
  await page.reload()
  assert.equal(await page.getByRole("radio", { name: "Horizontal", exact: true }).getAttribute("aria-checked"), "true")
  assert.equal(await page.getByLabel("Márgenes (mm)", { exact: true }).inputValue(), "20")
  await page.screenshot({ path: "test-results/pdf-options.png" })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByLabel("Márgenes (mm)", { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: "test-results/pdf-options-mobile.png" })
  await page.getByRole("combobox", { name: "Páginas", exact: true }).click()
  await page.getByRole("option", { name: "Una sola página larga", exact: true }).click()
  pdf = await download("single")
  assert.equal(pdf.getPageCount(), 1)
  assert.ok(Math.abs(pdf.getPage(0).getHeight() / pdf.getPage(0).getWidth() - 4.5) < 1e-8)
  assert.equal(await page.getByLabel("Márgenes (mm)", { exact: true }).count(), 0)
  console.log("PASS: PDF A4 pagination, orientation, margins, persisted options, single page and responsive controls")
} finally { await browser.close() }
