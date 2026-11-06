import { t } from "./i18n"
import { defaultPdfOptions, parsePdfOptions, type PdfOptions } from "./model"

export async function exportPdf(blob: Blob, title: string, settings: PdfOptions = defaultPdfOptions): Promise<Blob> {
  const { PDFDocument, PageSizes, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } = await import("pdf-lib")
  const options = parsePdfOptions(settings)
  const pdf = await PDFDocument.create()
  pdf.setTitle(title)
  pdf.setCreator("Encuadre")
  const image = await pdf.embedPng(await blob.arrayBuffer())
  if (options.layout === "single") {
    const scale = Math.min(PageSizes.A4[0] / image.width, 14400 / image.width, 14400 / image.height)
    const width = image.width * scale, height = image.height * scale
    pdf.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height })
  } else {
    const [width, height] = options.orientation === "landscape" ? [...PageSizes.A4].reverse() : PageSizes.A4
    const margin = options.margin * 72 / 25.4
    const contentWidth = width - 2 * margin, contentHeight = height - 2 * margin
    const imageHeight = image.height * contentWidth / image.width
    const count = Math.max(1, Math.ceil(imageHeight / contentHeight - 1e-9))
    for (let index = 0; index < count; index++) {
      const page = pdf.addPage([width, height])
      page.pushOperators(pushGraphicsState(), rectangle(margin, margin, contentWidth, contentHeight), clip(), endPath())
      page.drawImage(image, { x: margin, y: height - margin - imageHeight + index * contentHeight, width: contentWidth, height: imageHeight })
      page.pushOperators(popGraphicsState())
    }
  }
  return new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" })
}

export async function printCapture(url: string, title: string, settings: PdfOptions = defaultPdfOptions): Promise<void> {
  const options = parsePdfOptions(settings)
  const width = options.orientation === "landscape" ? 297 : 210
  const height = options.orientation === "landscape" ? 210 : 297
  const contentWidth = width - 2 * options.margin, contentHeight = height - 2 * options.margin
  const frame = document.createElement("iframe")
  frame.title = t("Imprimir captura")
  frame.setAttribute("aria-hidden", "true")
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;"
  document.body.append(frame)
  try {
    const doc = frame.contentDocument
    const view = frame.contentWindow
    if (!doc || !view) throw new Error(t("No se pudo preparar la impresión."))
    doc.title = title
    const style = doc.createElement("style")
    style.textContent = `@page{size:A4 ${options.orientation};margin:0}body{margin:0}section{box-sizing:border-box;position:relative;width:${width}mm;height:${height}mm;padding:${options.margin}mm;break-after:page}section:last-child{break-after:auto}.slice{position:relative;width:${contentWidth}mm;height:${contentHeight}mm;overflow:hidden}img{position:absolute;left:0;width:${contentWidth}mm;max-width:none}`
    doc.head.append(style)
    const image = doc.createElement("img")
    image.src = url
    await image.decode()
    const imageHeight = image.naturalHeight * contentWidth / image.naturalWidth
    const count = Math.max(1, Math.ceil(imageHeight / contentHeight - 1e-9))
    for (let index = 0; index < count; index++) {
      const page = doc.createElement("section")
      const clip = doc.createElement("div"); clip.className = "slice"
      const slice = image.cloneNode() as HTMLImageElement
      slice.style.top = `${-index * contentHeight}mm`
      clip.append(slice); page.append(clip)
      doc.body.append(page)
    }
    await Promise.all(Array.from(doc.images, image => image.decode()))
    view.addEventListener("afterprint", () => frame.remove(), { once: true })
    view.focus()
    view.print()
  } catch (error) {
    frame.remove()
    throw error
  }
}
