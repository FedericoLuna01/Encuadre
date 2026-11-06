import { t } from "@/lib/i18n"
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { Crop, MoveUpRight, Square, Type, Highlighter, Shield, Undo2, Redo2, Keyboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { paintMark, renderEdit, selection, type Edit, type Point, type Tool } from "@/lib/editor"

const tools = [ ["crop", t("Recortar"), Crop], ["arrow", t("Flecha"), MoveUpRight], ["rectangle", t("Rectángulo"), Square], ["text", t("Texto"), Type], ["highlight", t("Resaltar"), Highlighter], ["redact", t("Ocultar"), Shield] ] as const
export function CaptureEditor({ source, width, height, scale, onChange, onError, onBusy }: { source: Blob; width: number; height: number; scale: number; onChange: (blob: Blob, edit: Edit) => void; onError: (error: string) => void; onBusy: (busy: boolean) => void }) {
  const [history, setHistory] = useState<Edit[]>([{ crop: { x: 0, y: 0, width, height }, marks: [] }])
  const [index, setIndex] = useState(0)
  const [tool, setTool] = useState<Tool>("redact")
  const [color, setColor] = useState("#e63946")
  const [size, setSize] = useState(4)
  const [text, setText] = useState("")
  const [textOrigin, setTextOrigin] = useState<Point>()
  const [draft, setDraft] = useState<{ from: Point; to: Point }>()
  const [cursor, setCursor] = useState<Point>({ x: 16, y: 16 })
  const [rendering, setRendering] = useState(false)
  const [url, setUrl] = useState("")
  const surface = useRef<HTMLDivElement>(null)
  const preview = useRef<HTMLCanvasElement>(null)
  const textActive = useRef(false)
  const textInput = useRef<HTMLTextAreaElement>(null)
  const callbacks = useRef({ onChange, onError, onBusy }); callbacks.current = { onChange, onError, onBusy }
  const edit = history[index]
  useEffect(() => { if (textOrigin) textInput.current?.focus({ preventScroll: true }) }, [textOrigin])
  useEffect(() => {
    const context = preview.current?.getContext("2d")
    if (!context) return
    context.clearRect(0, 0, context.canvas.width, context.canvas.height)
    context.save(); context.translate(-edit.crop.x, -edit.crop.y)
    if (draft && tool !== "crop") paintMark(context, { tool, ...draft, color, size, text: "" }, edit.crop)
    if (textOrigin && text) paintMark(context, { tool: "text", from: textOrigin, to: textOrigin, color, size, text })
    // Existing masks must also cover the live annotation.
    if (draft || textOrigin) for (const mark of edit.marks) if (mark.tool === "redact") paintMark(context, mark, { x: 0, y: 0, width, height })
    context.restore()
  }, [draft, textOrigin, text, tool, color, size, edit, width, height])
  useEffect(() => {
    let disposed = false, currentUrl = "", successful = false
    setRendering(true); callbacks.current.onBusy(true)
    void renderEdit(source, edit).then(blob => {
      if (disposed) return
      successful = true; currentUrl = URL.createObjectURL(blob); setUrl(currentUrl); callbacks.current.onChange(blob, edit)
    }).catch(error => { if (!disposed) callbacks.current.onError(error instanceof Error ? error.message : t("No se pudo editar.")) })
      .finally(() => { if (!disposed) { setRendering(false); callbacks.current.onBusy(!successful) } })
    return () => { disposed = true; if (currentUrl) URL.revokeObjectURL(currentUrl) }
  }, [source, edit])

  function commit(from: Point, to: Point) {
    setDraft(undefined)
    setTextOrigin(undefined); setText("")
    if (tool === "text" && !text.trim()) { callbacks.current.onBusy(rendering); return }
    if (tool !== "text" && Math.abs(to.x - from.x) < 2 && Math.abs(to.y - from.y) < 2) return
    const next: Edit = tool === "crop" ? { ...edit, crop: selection(from, to, edit.crop) } : { ...edit, marks: [...edit.marks, { tool, from, to, color, size, text }] }
    callbacks.current.onBusy(true); setRendering(true)
    setHistory([...history.slice(0, index + 1), next]); setIndex(index + 1)
  }
  function finishText() {
    if (textOrigin && textActive.current) { textActive.current = false; commit(textOrigin, textOrigin) }
  }
  function point(event: PointerEvent): Point {
    const rect = surface.current!.getBoundingClientRect()
    return { x: Math.max(edit.crop.x, Math.min(edit.crop.x + edit.crop.width - 1, edit.crop.x + (event.clientX - rect.left) / rect.width * edit.crop.width)), y: Math.max(edit.crop.y, Math.min(edit.crop.y + edit.crop.height - 1, edit.crop.y + (event.clientY - rect.top) / rect.height * edit.crop.height)) }
  }
  function key(event: KeyboardEvent) {
    if (event.target !== event.currentTarget || rendering) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); setDraft(undefined); const next = Math.max(0, Math.min(history.length - 1, index + (event.shiftKey ? 1 : -1))); if (next !== index) { callbacks.current.onBusy(true); setRendering(true); setIndex(next) } return }
    if (event.key === "Escape") { setDraft(undefined); return }
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (draft) commit(draft.from, cursor); else if (tool === "text") { textActive.current = true; setText(""); setTextOrigin(cursor) } else setDraft({ from: cursor, to: cursor }); return }
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
    if (!direction) return
    event.preventDefault()
    const step = event.shiftKey ? 1 : 10
    const next = { x: Math.max(edit.crop.x, Math.min(edit.crop.x + edit.crop.width - 1, cursor.x + direction[0] * step)), y: Math.max(edit.crop.y, Math.min(edit.crop.y + edit.crop.height - 1, cursor.y + direction[1] * step)) }
    setCursor(next); if (draft) setDraft({ ...draft, to: next })
  }
  const box = draft && tool === "crop" ? selection(draft.from, draft.to, edit.crop) : undefined
  return <section className="capture-editor" aria-label={t("Editor de captura")}>
    <div className="editor-controls">
    <div className="editor-tools">
      <ToggleGroup type="single" variant="outline" spacing={1} value={tool} onValueChange={value => { if (value) { setTool(value as Tool); setDraft(undefined) } }} aria-label={t("Herramientas de edición")}>
        {tools.map(([id, label, Icon]) => <ToggleGroupItem key={id} value={id} aria-label={label} title={label}><Icon/>{label}</ToggleGroupItem>)}
      </ToggleGroup>
      <div className="editor-history" role="group" aria-label={t("Historial de edición")}><Button variant="ghost" size="sm" aria-label={t("Deshacer")} title={t("Deshacer (Ctrl/⌘ Z)")} disabled={index === 0 || rendering} onClick={() => { setDraft(undefined); callbacks.current.onBusy(true); setRendering(true); setIndex(index - 1) }}><Undo2 data-icon="inline-start"/><span>{t("Deshacer")}</span></Button><Button variant="ghost" size="sm" aria-label={t("Rehacer")} title={t("Rehacer (Ctrl/⌘ Mayús Z)")} disabled={index === history.length - 1 || rendering} onClick={() => { setDraft(undefined); callbacks.current.onBusy(true); setRendering(true); setIndex(index + 1) }}><Redo2 data-icon="inline-start"/><span>{t("Rehacer")}</span></Button></div>
    </div>
      {tool !== "redact" && tool !== "crop" && <FieldGroup className="editor-fields">
        <Field orientation="horizontal"><FieldLabel htmlFor="edit-color">{t("Color")}</FieldLabel><Input id="edit-color" type="color" value={color} onChange={event => setColor(event.target.value)}/></Field>
        <Field orientation="horizontal"><FieldLabel htmlFor="edit-size">{tool === "text" ? t("Tamaño") : t("Grosor")}</FieldLabel><Input id="edit-size" type="number" min={1} max={24} value={size} onChange={event => setSize(Math.min(24, Math.max(1, Number(event.target.value) || 1)))}/></Field>
      </FieldGroup>}
      <p className="fine-print editor-help" id="editor-help">{tool === "redact" ? t("Arrastrá para tapar datos. Lo que cubras no se verá en el archivo descargado.") : tool === "text" ? t("Hacé clic en la imagen y escribí. Enter para confirmar, Mayús + Enter para otra línea y Escape para cancelar.") : tool === "crop" ? t("Arrastrá para elegir la parte que querés conservar.") : tool === "arrow" ? t("Arrastrá desde el inicio hasta la punta de la flecha.") : t("Arrastrá sobre la imagen para marcar el área.")}</p>
    </div>
    <div className="editor-scroll"><div ref={surface} className="editor-surface" tabIndex={0} role="application" aria-label={t("Lienzo de edición")} aria-describedby="editor-help" aria-busy={rendering} style={{ width: edit.crop.width * scale, height: edit.crop.height * scale, cursor: tool === "text" ? "text" : undefined }}
      onKeyDown={key} onPointerDown={event => { if (event.button !== 0 || rendering || textOrigin) return; event.currentTarget.focus({ preventScroll: true }); const from = point(event); setCursor(from); if (tool === "text") { event.preventDefault(); textActive.current = true; setText(""); setTextOrigin(from) } else { event.currentTarget.setPointerCapture(event.pointerId); setDraft({ from, to: from }) } }}
      onPointerMove={event => { if (draft) setDraft({ ...draft, to: point(event) }) }} onPointerUp={event => { if (draft) commit(draft.from, point(event)) }} onPointerCancel={() => setDraft(undefined)}>
      {url && <img src={url} alt={t("Captura en edición")} draggable={false}/>}
      <canvas ref={preview} className="editor-preview" width={edit.crop.width} height={edit.crop.height} aria-hidden="true"/>
      {textOrigin && <textarea ref={textInput} className="editor-inline-text" aria-label={t("Texto a colocar")} placeholder={t("Escribí acá")} wrap="off" value={text}
        style={{ left: (textOrigin.x - edit.crop.x) * scale, top: (textOrigin.y - edit.crop.y) * scale, width: (edit.crop.x + edit.crop.width - textOrigin.x) * scale, height: Math.max(size * 7, text.split("\n").length * size * 6 + size * 2) * scale, fontSize: size * 5 * scale, lineHeight: "1.2", caretColor: color }}
        onChange={event => { setText(event.target.value); callbacks.current.onBusy(!!event.target.value.trim()) }} onBlur={finishText} onPointerDown={event => event.stopPropagation()}
        onKeyDown={event => {
          event.stopPropagation()
          if (event.nativeEvent.isComposing) return
          if (event.key === "Escape") { event.preventDefault(); textActive.current = false; setTextOrigin(undefined); setText(""); callbacks.current.onBusy(rendering); surface.current?.focus({ preventScroll: true }) }
          else if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); finishText(); surface.current?.focus({ preventScroll: true }) }
        }}/>}
      {box && <div className="editor-selection" style={{ left: (box.x - edit.crop.x) * scale, top: (box.y - edit.crop.y) * scale, width: box.width * scale, height: box.height * scale, background: tool === "redact" ? "#000" : undefined }}/>}
      <span className="editor-cursor" style={{ left: (cursor.x - edit.crop.x) * scale, top: (cursor.y - edit.crop.y) * scale }}/>
    </div></div>
    <div className="editor-footer"><p className="fine-print" role="status">{rendering ? t("Preparando edición…") : index === 0 ? t("Sin cambios") : index === 1 ? t("{count} cambio", { count: index }) : t("{count} cambios", { count: index })}</p><details className="editor-shortcuts"><summary><Keyboard aria-hidden="true"/>{t("Atajos de teclado")}</summary><p className="fine-print">{t("Flechas para mover; Mayús + flechas para mayor precisión. Enter para empezar y terminar, Escape para cancelar. Ctrl/⌘ Z para deshacer y Ctrl/⌘ Mayús Z para rehacer.")}</p></details></div>
  </section>
}
