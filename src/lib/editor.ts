import { t } from "./i18n"
export interface Point { x: number; y: number }
export interface Rect extends Point { width: number; height: number }
export type Tool = "crop" | "arrow" | "rectangle" | "text" | "highlight" | "redact"
export interface Mark { tool: Exclude<Tool, "crop">; from: Point; to: Point; color: string; size: number; text: string }
export interface Edit { crop: Rect; marks: Mark[] }
export type CropHandle = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se"

export function adjustCrop(box: Rect, handle: CropHandle, delta: Point, bounds: Rect): Rect {
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value)))
  if (handle === "move") return { ...box,
    x: clamp(box.x + delta.x, bounds.x, bounds.x + bounds.width - box.width),
    y: clamp(box.y + delta.y, bounds.y, bounds.y + bounds.height - box.height) }
  let { x, y } = box
  let right = x + box.width, bottom = y + box.height
  if (handle.includes("w")) x = clamp(x + delta.x, bounds.x, right - 1)
  if (handle.includes("e")) right = clamp(right + delta.x, x + 1, bounds.x + bounds.width)
  if (handle.includes("n")) y = clamp(y + delta.y, bounds.y, bottom - 1)
  if (handle.includes("s")) bottom = clamp(bottom + delta.y, y + 1, bounds.y + bounds.height)
  return { x, y, width: right - x, height: bottom - y }
}

export function selection(from: Point, to: Point, bounds: Rect): Rect {
  const x = Math.max(bounds.x, Math.min(from.x, to.x))
  const y = Math.max(bounds.y, Math.min(from.y, to.y))
  return { x: Math.round(x), y: Math.round(y), width: Math.max(1, Math.round(Math.min(bounds.x + bounds.width, Math.max(from.x, to.x)) - x)), height: Math.max(1, Math.round(Math.min(bounds.y + bounds.height, Math.max(from.y, to.y)) - y)) }
}

export function paintMark(context: CanvasRenderingContext2D, mark: Mark, bounds: Rect = { x: 0, y: 0, width: context.canvas.width, height: context.canvas.height }) {
  const { from, to, tool, color, size } = mark
  const rect = selection(from, to, bounds)
  context.save()
  context.strokeStyle = color; context.fillStyle = color; context.lineWidth = size; context.lineCap = "round"
  if (tool === "redact") {
    context.globalAlpha = 1; context.globalCompositeOperation = "source-over"; context.fillStyle = "#000000"
    context.fillRect(Math.floor(rect.x), Math.floor(rect.y), Math.ceil(rect.width), Math.ceil(rect.height))
  } else if (tool === "highlight") {
    context.globalAlpha = .35; context.fillRect(rect.x, rect.y, rect.width, rect.height)
  } else if (tool === "rectangle") context.strokeRect(rect.x, rect.y, rect.width, rect.height)
  else if (tool === "text") {
    context.font = `${size * 5}px "IBM Plex Sans", sans-serif`; context.textBaseline = "top"
    for (const [index, line] of mark.text.split("\n").entries()) context.fillText(line, from.x, from.y + index * size * 6)
  } else {
    const angle = Math.atan2(to.y - from.y, to.x - from.x), head = size * 5
    context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y)
    context.moveTo(to.x - head * Math.cos(angle - Math.PI / 6), to.y - head * Math.sin(angle - Math.PI / 6))
    context.lineTo(to.x, to.y); context.lineTo(to.x - head * Math.cos(angle + Math.PI / 6), to.y - head * Math.sin(angle + Math.PI / 6)); context.stroke()
  }
  context.restore()
}

export async function renderEdit(source: Blob, edit: Edit): Promise<Blob> {
  const image = await createImageBitmap(source)
  try {
    const canvas = document.createElement("canvas")
    canvas.width = image.width; canvas.height = image.height
    const context = canvas.getContext("2d")
    if (!context) throw new Error(t("No se pudo preparar la edición."))
    context.drawImage(image, 0, 0)
    // Opaque masks are always last, including over later annotations.
    for (const mark of edit.marks.filter(mark => mark.tool !== "redact")) paintMark(context, mark)
    for (const mark of edit.marks.filter(mark => mark.tool === "redact")) paintMark(context, mark)
    const output = document.createElement("canvas")
    output.width = edit.crop.width; output.height = edit.crop.height
    const drawing = output.getContext("2d")
    if (!drawing) throw new Error(t("No se pudo recortar la imagen."))
    drawing.drawImage(canvas, edit.crop.x, edit.crop.y, edit.crop.width, edit.crop.height, 0, 0, output.width, output.height)
    // Only flattened pixels go into the PNG. No source image or editing history.
    return await new Promise<Blob>((resolve, reject) => output.toBlob(blob => blob ? resolve(blob) : reject(new Error(t("No se pudo generar la imagen editada."))), "image/png"))
  } finally { image.close() }
}
