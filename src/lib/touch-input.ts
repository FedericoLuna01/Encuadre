// Injected only in the framed site's isolated world. Chrome's global mouse-to-
// touch conversion also intercepts the extension controls, so translate trusted
// mouse input only over the phone, then let CDP produce real touch events.
export function installTouchInput(enabled: boolean) {
  const scope = globalThis as typeof globalThis & { __encuadreTouch?: () => void }
  scope.__encuadreTouch?.(); delete scope.__encuadreTouch
  if (!enabled) return
  let active = false, lastMove = 0, suppressUntil = 0
  let queue = Promise.resolve()
  const send = (phase: "start" | "move" | "end" | "cancel", event: PointerEvent) => {
    const message = { type: "emulator-touch", phase, x: event.clientX, y: event.clientY }
    queue = queue.then(async () => { await chrome.runtime.sendMessage(message) }).catch(() => { active = false })
  }
  const down = (event: PointerEvent) => {
    if (!event.isTrusted || event.pointerType !== "mouse" || event.button !== 0) return
    event.preventDefault(); event.stopImmediatePropagation()
    active = true; suppressUntil = Date.now() + 1000; send("start", event)
  }
  const move = (event: PointerEvent) => {
    if (!active || !event.isTrusted || event.pointerType !== "mouse") return
    event.preventDefault(); event.stopImmediatePropagation()
    if (performance.now() - lastMove < 16) return
    lastMove = performance.now(); send("move", event)
  }
  const up = (event: PointerEvent) => {
    if (!active || !event.isTrusted || event.pointerType !== "mouse") return
    event.preventDefault(); event.stopImmediatePropagation()
    active = false; suppressUntil = Date.now() + 700; send(event.type === "pointerup" ? "end" : "cancel", event)
  }
  const leave = (event: PointerEvent) => { if (!event.relatedTarget) up(event) }
  const click = (event: MouseEvent) => {
    if (event.isTrusted && event instanceof PointerEvent && event.pointerType === "mouse" && Date.now() < suppressUntil) { event.preventDefault(); event.stopImmediatePropagation() }
  }
  addEventListener("pointerdown", down, true); addEventListener("pointermove", move, true)
  addEventListener("pointerup", up, true); addEventListener("pointercancel", up, true); addEventListener("pointerout", leave, true); addEventListener("click", click, true)
  scope.__encuadreTouch = () => {
    removeEventListener("pointerdown", down, true); removeEventListener("pointermove", move, true)
    removeEventListener("pointerup", up, true); removeEventListener("pointercancel", up, true); removeEventListener("pointerout", leave, true); removeEventListener("click", click, true)
  }
}
