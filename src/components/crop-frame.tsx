import { useRef, type PointerEvent } from "react"
import { t } from "@/lib/i18n"
import { adjustCrop, type CropHandle, type Point, type Rect } from "@/lib/editor"

const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const

// The frame stays in source pixels; only its presentation changes with zoom.
export function CropFrame({ box, bounds, scale, onChange, onConfirm }: {
  box: Rect; bounds: Rect; scale: number; onChange: (box: Rect) => void; onConfirm: () => void
}) {
  const drag = useRef<{ handle: CropHandle; origin: Point; box: Rect } | null>(null)
  const left = (box.x - bounds.x) * scale, top = (box.y - bounds.y) * scale
  const width = box.width * scale, height = box.height * scale
  function start(event: PointerEvent, handle: CropHandle) {
    if (event.button !== 0) return
    event.preventDefault(); event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { handle, origin: { x: event.clientX, y: event.clientY }, box }
  }
  function move(event: PointerEvent) {
    if (!drag.current) return
    event.stopPropagation()
    const { handle, origin, box: initial } = drag.current
    onChange(adjustCrop(initial, handle, { x: (event.clientX - origin.x) / scale, y: (event.clientY - origin.y) / scale }, bounds))
  }
  return <div className="editor-crop-layer" onPointerMove={move} onPointerUp={event => {
    if (!drag.current) return
    move(event); event.stopPropagation(); drag.current = null
  }} onPointerCancel={event => {
    if (!drag.current) return
    onChange(drag.current.box); drag.current = null; event.stopPropagation()
  }}>
    <div className="editor-crop-shade" style={{ inset: "0 0 auto", height: top }}/>
    <div className="editor-crop-shade" style={{ inset: "auto 0 0", height: (bounds.height * scale) - top - height }}/>
    <div className="editor-crop-shade" style={{ left: 0, top, width: left, height }}/>
    <div className="editor-crop-shade" style={{ right: 0, top, width: (bounds.width * scale) - left - width, height }}/>
    <div className="editor-crop-frame" role="group" aria-label={t("Marco de recorte")}
      style={{ left, top, width, height }}
      onPointerDown={event => start(event, "move")} onDoubleClick={event => { event.stopPropagation(); onConfirm() }}>
      <div className="editor-crop-grid" aria-hidden="true">{[1, 2].map(line => <span key={line} style={{ left: `${line * 100 / 3}%` }}/>)}{[1, 2].map(line => <span key={line} style={{ top: `${line * 100 / 3}%` }}/>)}</div>
      {handles.map(handle => <button key={handle} type="button" className="editor-crop-handle" data-handle={handle}
        aria-label={t("Ajustar recorte: {edge}", { edge: handle })} onPointerDown={event => start(event, handle)}
        onKeyDown={event => {
          const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
          if (!direction) return
          event.preventDefault(); event.stopPropagation()
          const step = event.shiftKey ? 10 : 1
          onChange(adjustCrop(box, handle, { x: direction[0] * step, y: direction[1] * step }, bounds))
        }}/>) }
    </div>
  </div>
}
