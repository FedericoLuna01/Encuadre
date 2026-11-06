import { t } from "@/lib/i18n"
import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { Camera, Check, ExternalLink, Globe, Info, LoaderCircle, Smartphone, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CaptureProgress } from "@/components/capture-progress"
import { Brand } from "@/components/brand"
import { defaults, initialState, isBusy, profiles, type CaptureState, type Preferences } from "@/lib/model"
import { getPreferences, savePreferences } from "@/lib/store"
import { inExtension, request } from "@/lib/client"
import "./styles.css"

document.documentElement.classList.add("popup-document")
document.documentElement.dataset.surface = inExtension && chrome.extension.getViews({ type: "popup" }).includes(window) ? "popup" : "tab"

function Panel() {
  const [preferences, setPreferences] = useState<Preferences>(defaults)
  const [state, setState] = useState<CaptureState>(initialState)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState("")
  const busy = isBusy(state.stage)
  const disabled = loading || working || busy || !inExtension || !state.tabId

  useEffect(() => {
    let disposed = false
    void (async () => {
      try {
        const saved = await getPreferences()
        if (disposed) return
        setPreferences(saved)
        if (inExtension) {
          const current = await request({ type: "state" })
          const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
          if (!isBusy(current.stage) && (current.tabId === undefined || (active?.url && /^https?:/.test(active.url) && active.id !== current.tabId))) {
            try { setState(await request({ type: "target" })) }
            catch (reason) { setError(reason instanceof Error ? reason.message : t("No se pudo conectar la página.")) }
          } else setState(current)
        }
      } catch { setError(t("No se pudieron leer las preferencias guardadas.")) }
      finally { if (!disposed) setLoading(false) }
    })()
    const poll = inExtension ? setInterval(() => { void request({ type: "state" }).then(value => { if (!disposed) setState(value) }).catch(() => {}) }, 500) : undefined
    return () => { disposed = true; clearInterval(poll) }
  }, [])

  async function run(action: () => Promise<void>) {
    setWorking(true)
    setError("")
    try { await action() }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("No se pudo completar la operación.")) }
    finally { setWorking(false) }
  }

  async function startCapture(kind: "full" | "visible") {
    // Captures from this menu use the original page; framed captures live in the emulator.
    if (state.appliedProfile || state.inline) setState(await request({ type: "apply", profile: null, scale: "fit" }))
    setState(await request({ type: "capture", kind }))
  }

  async function openEmulator() {
    const profile = preferences.profile?.kind === "phone" ? preferences.profile : profiles.find(p => p.id === "iphone-13")!
    await savePreferences({ ...preferences, profile })
    setState(await request({ type: "apply", profile, scale: preferences.previewScale }))
    setState(await request({ type: "simulator" }))
    if (document.documentElement.dataset.surface === "popup") window.close()
  }

  return <div className="panel-shell">
    <header className="panel-header"><Brand/>{working && <LoaderCircle className="size-4" aria-label={t("Procesando")}/>}</header>
    <main className="control-sheet" aria-busy={loading || working}>
      <section className="source-line" aria-label={t("Página de origen")}>
        <Globe aria-hidden="true"/><div><strong className="truncate" title={state.tabTitle}>{state.tabTitle || t("Conectá una página")}</strong><span className="truncate">{state.tabUrl ? new URL(state.tabUrl).host : t("Abrí Encuadre desde el ícono de Chrome")}</span></div>
      </section>
      {!inExtension && <Alert><Info/><AlertTitle>{t("Vista previa")}</AlertTitle><AlertDescription>{t("Cargá la carpeta dist en las extensiones de Chrome para capturar.")}</AlertDescription></Alert>}
      {(error || state.error) && <Alert variant="destructive"><Info/><AlertTitle>{t("No se pudo continuar")}</AlertTitle><AlertDescription>{error || state.error}</AlertDescription></Alert>}
      <section className="popup-actions" aria-labelledby="capture-title">
        <h1 id="capture-title" className="sr-only">{t("Capturas de página")}</h1>
        {busy ? <div className="capture-progress"><CaptureProgress state={state}/><Button variant="outline" disabled={working} onClick={() => void run(async () => setState(await request({ type: "cancel" })))}><X data-icon="inline-start"/>{t("Cancelar captura")}</Button></div> : <>
          <Button className="popup-capture-primary" size="lg" disabled={disabled} onClick={() => void run(() => startCapture("full"))}>
            <svg className="popup-page-diagram" viewBox="0 0 100 80" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="28" y="3" width="44" height="74" rx="3"/><path d="M28 14h44M37 23h26M37 30h18M37 48h26M37 55h18M37 69h26M82 8v62m-4-5 4 5 4-5"/></svg>
            <span className="popup-action-copy"><strong>{t("Capturar página completa")}</strong><span aria-hidden="true">{t("De principio a fin.")}</span></span>
          </Button>
          <div className="popup-secondary-actions">
            <Button className="popup-capture-secondary" variant="outline" disabled={disabled} onClick={() => void run(() => startCapture("visible"))}><Camera data-icon="inline-start" aria-hidden="true"/><span className="popup-action-copy"><strong>{t("Capturar pantalla")}</strong><span aria-hidden="true">{t("Solo la parte visible")}</span></span></Button>
            <Button className="popup-capture-secondary" variant="outline" disabled={disabled} onClick={() => void run(openEmulator)}><Smartphone data-icon="inline-start" aria-hidden="true"/><span className="popup-action-copy"><strong>{t("Emulador de celular")}</strong><span aria-hidden="true">{t("Probá otros tamaños")}</span></span></Button>
          </div>
          <p className="fine-print emulator-hint">{t("Las capturas con marco de celular se hacen desde el emulador.")}</p>
        </>}
      </section>
      {!busy && (state.stage === "done" || state.stage === "cancelled") && <p role="status" className="status-line"><Check/>{state.message}</p>}
      {state.stage === "done" && state.resultId && <Button variant="ghost" disabled={working} onClick={() => void run(async () => setState(await request({ type: "show-result" })))}><ExternalLink data-icon="inline-start"/>{t("Ver última captura")}</Button>}
    </main>
  </div>
}

createRoot(document.getElementById("root")!).render(<Panel/>)
