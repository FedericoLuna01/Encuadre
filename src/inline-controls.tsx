import { t } from "@/lib/i18n"
import { useEffect, useRef, useState } from "react"
import { Camera, ChevronDown, Download, Info, Monitor, RotateCw, X } from "lucide-react"
import { Brand } from "@/components/brand"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectGroup, SelectLabel, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CaptureProgress } from "@/components/capture-progress"
import { defaults, initialState, isBusy, profiles, type CaptureState, type Preferences, type Profile } from "@/lib/model"
import { request } from "@/lib/client"
import { getPreferences, savePreferences } from "@/lib/store"
import { DeviceFrame } from "@/components/device-frame"
import { frameGeometry } from "@/lib/device-frame"
import { deviceViewport, frameColors } from "@/lib/device-viewport"
import { profileGroups } from "@/lib/profile-groups"
import { finishColors } from "@/lib/finish-colors"
import { capturePlane, readCaptureRect, inputPoint, type CaptureControl, type CaptureControlReply } from "@/lib/capture-control"

export function InlineControls() {
  const [state, setState] = useState<CaptureState>(initialState)
  const [preferences, setPreferences] = useState<Preferences>(defaults)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState("")
  const [space, setSpace] = useState({ width: 900, height: 900 })
  const workspace = useRef<HTMLDivElement>(null)
  const source = new URLSearchParams(location.search).get("source") ?? ""
  const profile = state.appliedProfile
  const previewScale = state.previewScale ?? preferences.previewScale
  const busy = isBusy(state.stage)
  const viewport = profile ? deviceViewport(profile) : null
  const finishes = profile ? frameColors(profile) : null
  const groups = profileGroups(preferences.customProfiles)
  const g = profile ? frameGeometry(profile) : null
  const scale = g ? previewScale === "fit" ? Math.min(1, Math.max(.1, (space.width - 48) / g.width), Math.max(.1, (space.height - 48) / g.height)) : previewScale : 1
  useEffect(() => {
    if (!workspace.current) return
    const observer = new ResizeObserver(([entry]) => setSpace({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(workspace.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    let owner: number | undefined
    let revision = 0
    void chrome.tabs.getCurrent().then(tab => { owner = tab?.id })
    const control = (raw: CaptureControl, sender: chrome.runtime.MessageSender, respond: (reply: CaptureControlReply) => void) => {
      if (sender.id !== chrome.runtime.id || raw?.type !== "capture-control" || raw.tabId !== owner) return
      const current = ++revision
      void (async () => {
        try {
          if (raw.action === "input") { respond({ ok: true, rect: inputPoint(raw.x ?? 0, raw.y ?? 0) }); return }
          await capturePlane(raw)
          if (raw.action !== "end") await new Promise(resolve => setTimeout(resolve, 80))
          if (current !== revision) throw new Error(t("La captura se interrumpió."))
          respond({ ok: true, rect: readCaptureRect() })
        } catch (reason) { respond({ ok: false, error: reason instanceof Error ? reason.message : t("No se pudo preparar la captura.") }) }
      })()
      return true
    }
    chrome.runtime.onMessage.addListener(control)
    void getPreferences().then(value => { if (!disposed) setPreferences(value) })
    void request({ type: "state" }).then(value => { if (!disposed) setState(value) })
    async function refresh() {
      try { const value = await request({ type: "inline-refresh" }); if (!disposed) { setState(value); setError("") } }
      catch (reason) { if (!disposed) setError(reason instanceof Error ? reason.message : t("No se pudo conectar la página.")) }
      finally { if (!disposed) timer = setTimeout(() => void refresh(), 500) }
    }
    void refresh()
    return () => { disposed = true; clearTimeout(timer); chrome.runtime.onMessage.removeListener(control) }
  }, [])

  async function run(action: () => Promise<void>) {
    setWorking(true); setError("")
    try { await action() }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("No se pudo completar la operación.")) }
    finally { setWorking(false) }
  }
  async function choose(next: Profile) {
    const updated = { ...preferences, profile: next, previewScale }
    await savePreferences(updated); setPreferences(updated)
    setState(await request({ type: "apply", profile: next, scale: previewScale }))
  }
  async function close() {
    await request({ type: "apply", profile: null, scale: "fit" })
    parent.postMessage("encuadre-close", "*")
  }
  return <div className="inline-shell">
    <main className="inline-workspace" ref={workspace} aria-label={t("Vista del celular")}>
      {profile && viewport && /^https?:/.test(source) && <DeviceFrame profile={profile} src="" scale={scale} appearance={state.appearance}>
        <iframe name="encuadre-site" className="inline-site" title={t("Página interactiva en {name}", { name: profile.name })} src={source} data-viewport-width={viewport.width} data-viewport-height={viewport.height} style={{ width: viewport.width, height: viewport.height, pointerEvents: busy ? "none" : undefined }} allow="clipboard-read; clipboard-write; fullscreen"/>
      </DeviceFrame>}
    </main>
    <aside className="inline-controls" aria-label={t("Controles de la vista de celular")}>
    <header className="inline-controls-header"><Brand/><Button variant="ghost" size="icon" aria-label={t("Cerrar vista de celular")} disabled={working || busy} onClick={() => void run(close)}><X/></Button></header>
    <section className="inline-controls-body">
      <div className="inline-title"><h1>{t("Vista de celular")}</h1><p>{t("Probá la página y elegí qué capturar.")}</p></div>
      <div className="inline-device-settings"><FieldGroup className="inline-device-fields">
        <Field><FieldLabel>{t("Modelo de dispositivo")}</FieldLabel><Select value={profile?.id ?? ""} disabled={working || busy} onValueChange={id => { const next = [...profiles, ...preferences.customProfiles].find(p => p.id === id); if (next) void run(() => choose(next)) }}><SelectTrigger aria-label={t("Modelo de dispositivo")}><SelectValue placeholder={t("Elegí un modelo")}>{profile?.name}</SelectValue></SelectTrigger><SelectContent position="popper" align="end" className="max-h-[min(24rem,var(--radix-select-content-available-height))]">{groups.map(group => <SelectGroup key={group.label}><SelectLabel>{group.label}</SelectLabel>{group.profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.name} · {p.width} × {p.height}</SelectItem>)}</SelectGroup>)}</SelectContent></Select></Field>
      </FieldGroup><div className="inline-device-meta"><p className="inline-dimensions">{state.viewport ? <><span>{state.viewport.width} × {state.viewport.height}</span><span>{t("Área de la página · CSS px")}</span></> : t("Abriendo la página…")}</p><Button variant="outline" size="sm" aria-label={t("Rotar dispositivo")} disabled={working || busy || !profile} onClick={() => profile && void run(() => choose({ ...profile, width: profile.height, height: profile.width }))}><RotateCw data-icon="inline-start"/>{t("Rotar")}</Button></div></div>
      <FieldGroup className="inline-device-fields">
        {profile && finishes && <Field><div className="finish-heading"><FieldLabel id="device-color-label">{t("Color")}</FieldLabel><span id="device-color-name" aria-live="polite">{finishes.colors.find(color => color.id === finishes.selected)?.name}</span></div><ToggleGroup type="single" value={finishes.selected} disabled={working || busy} spacing={1} aria-label={t("Color del dispositivo")} aria-describedby="device-color-name" className="finish-options" onValueChange={color => { if (color) void run(() => choose({ ...profile, color })) }}>{finishes.colors.map(color => <ToggleGroupItem key={color.id} value={color.id} aria-label={color.name} title={color.name} className="finish-option"><span className="finish-swatch" style={{ backgroundColor: finishColors[color.id] }} aria-hidden="true"/></ToggleGroupItem>)}</ToggleGroup></Field>}
        <Field><FieldLabel>{t("Ampliación")}</FieldLabel><Select value={String(previewScale)} disabled={working || busy || !profile} onValueChange={value => void run(async () => { const next = { ...preferences, previewScale: value === "fit" ? "fit" as const : Number(value) }; await savePreferences(next); setPreferences(next); if (profile) setState(await request({ type: "apply", profile, scale: next.previewScale })) })}><SelectTrigger aria-label={t("Ampliación del teléfono")}><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="fit">{t("Ajustar a la ventana")}</SelectItem><SelectItem value="1">100 %</SelectItem><SelectItem value="0.75">75 %</SelectItem><SelectItem value="0.5">50 %</SelectItem></SelectGroup></SelectContent></Select></Field>
      </FieldGroup>
      <details className="emulation-options inline-advanced"><summary>{t("Opciones avanzadas")}<ChevronDown aria-hidden="true"/></summary><FieldGroup>
        <Field><FieldLabel>{t("Densidad de píxeles")}</FieldLabel><Select value={String(preferences.emulation.density)} disabled={working || busy} onValueChange={value => setPreferences({ ...preferences, emulation: { ...preferences.emulation, density: Number(value) } })}><SelectTrigger aria-label={t("Densidad de píxeles")}><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="1">1×</SelectItem><SelectItem value="2">2×</SelectItem><SelectItem value="3">3×</SelectItem></SelectGroup></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="emulator-agent">User-Agent</FieldLabel><Input id="emulator-agent" value={preferences.emulation.userAgent} maxLength={512} placeholder={t("Automático según el dispositivo")} disabled={working || busy} onChange={event => setPreferences({ ...preferences, emulation: { ...preferences.emulation, userAgent: event.target.value } })}/></Field>
        <Field><FieldLabel htmlFor="emulator-touch"><input id="emulator-touch" type="checkbox" checked={preferences.emulation.touch} disabled={working || busy} onChange={event => setPreferences({ ...preferences, emulation: { ...preferences.emulation, touch: event.target.checked } })}/>{t("Entrada táctil")}</FieldLabel></Field>
        <Button variant="outline" disabled={working || busy} onClick={() => void run(async () => { const next = await request({ type: "emulation", settings: preferences.emulation }); await savePreferences(preferences); setState(next) })}>{t("Aplicar opciones")}</Button>
        <p className="fine-print">{t("La identificación cambia para las próximas solicitudes. Recargar vuelve a abrir la página y puede perder formularios sin guardar.")}</p>
        <Button variant="outline" disabled={working || busy} onClick={() => void run(async () => { setState(await request({ type: "reload-emulator" })) })}>{t("Recargar página del celular")}</Button>
        <p className="fine-print">{t("La vista usa Chrome con entrada táctil y navegador móvil. No ejecuta Safari. Chrome muestra un aviso de depuración mientras está abierta.")}</p>
      </FieldGroup></details>
      {(error || state.error) && <Alert variant="destructive"><Info/><AlertTitle>{t("No se pudo completar")}</AlertTitle><AlertDescription>{error || state.error}</AlertDescription></Alert>}
    </section>
    <footer className="inline-controls-footer">
      {busy ? <div className="inline-progress"><CaptureProgress state={state}/><Button variant="outline" onClick={() => void request({ type: "cancel" }).then(setState)}>{t("Cancelar captura")}</Button></div> : <div className="inline-capture-actions"><Button size="lg" disabled={working || !profile} onClick={() => void run(async () => { setState(await request({ type: "capture", kind: "visible" })) })}><Camera data-icon="inline-start"/>{t("Capturar pantalla")}</Button><Button variant="outline" disabled={working || !profile} onClick={() => void run(async () => { setState(await request({ type: "capture", kind: "full" })) })}><Download data-icon="inline-start"/>{t("Página completa")}</Button><p>{t("El resultado se abre en otra pestaña.")}</p></div>}
      <Button variant="ghost" className="inline-return" disabled={working || busy} onClick={() => void run(close)}><Monitor data-icon="inline-start"/>{t("Volver a escritorio")}</Button>
    </footer>
  </aside></div>
}
