import { t, formatNumber, locale } from "@/lib/i18n"
import { useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { ArrowLeft, Check, ChevronDown, Clipboard, Download, ImageOff, Info, Maximize, Minus, Plus, Printer, RotateCw, ShieldCheck, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Brand } from "@/components/brand"
import { CaptureEditor } from "@/components/capture-editor"
import { CaptureProgress } from "@/components/capture-progress"
import type { Edit } from "@/lib/editor"
import { ExportOptions, PdfExportOptions } from "@/components/export-options"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { defaults, filename, initialState, isBusy, type CaptureState, type CaptureRecord, type Preferences, type ExportFormat } from "@/lib/model"
import { exportPdf, printCapture } from "@/lib/export"
import { getPreferences, readCapture, savePreferences } from "@/lib/store"
import { request } from "@/lib/client"
import { canFrame, composeFrame, frameOutputSize } from "@/lib/device-frame"
import "./styles.css"

function Result() {
  const [editing, setEditing] = useState(false)
  const [editorStarted, setEditorStarted] = useState(false)
  const [editorBusy, setEditorBusy] = useState(false)
  const [edited, setEdited] = useState<{ blob: Blob; edit: Edit }>()
  const [editedUrl, setEditedUrl] = useState("")
  const [record, setRecord] = useState<CaptureRecord>()
  const [preferences, setPreferences] = useState<Preferences>(defaults)
  const [imageUrl, setImageUrl] = useState("")
  const [loading, setLoading] = useState(true)
  const [captureState, setCaptureState] = useState<CaptureState>(initialState)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState("")
  const [copied, setCopied] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const [error, setError] = useState("")
  const [zoom, setZoom] = useState<number | "fit" | "width">("fit")
  const [withFrame, setWithFrame] = useState(true)
  const presentationBeforeEditing = useRef(true)
  const [framedBlob, setFramedBlob] = useState<Blob>()
  const [framedUrl, setFramedUrl] = useState("")
  const [framing, setFraming] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const canvas = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(false), 2200)
    return () => window.clearTimeout(timeout)
  }, [copied])

  useEffect(() => { setCopied(false) }, [edited, withFrame])

  useEffect(() => {
    if (!downloaded) return
    const timeout = window.setTimeout(() => setDownloaded(false), 3000)
    return () => window.clearTimeout(timeout)
  }, [downloaded])

  useEffect(() => {
    let url = ""
    let disposed = false
    void (async () => {
      try {
        const params = new URLSearchParams(location.search)
        const id = params.get("id")
        const saved = await getPreferences()
        if (disposed) return
        setPreferences(saved)
        function openCapture(capture: CaptureRecord) {
          url = URL.createObjectURL(capture.blob); setImageUrl(url); setRecord(capture)
          if (params.has("pending")) { params.delete("pending"); history.replaceState(null, "", `?${params}`) }
        }
        while (!disposed) {
          const capture = id ? await readCapture(id) : undefined
          if (disposed) return
          if (capture) {
            openCapture(capture)
            break
          }
          if (!params.has("pending")) break
          const current = await request({ type: "state" })
          if (disposed) return
          setCaptureState(current)
          if (!isBusy(current.stage)) {
            // Saving can finish between the database read and the state reply.
            const completed = id ? await readCapture(id) : undefined
            if (disposed) return
            if (completed) openCapture(completed)
            else setError(current.error || current.message)
            break
          }
          await new Promise(resolve => setTimeout(resolve, 250))
        }
      } catch { setError(t("No se pudo abrir la captura. Volvé a capturar la página de origen.")) }
      finally { if (!disposed) setLoading(false) }
    })()
    return () => { disposed = true; if (url) URL.revokeObjectURL(url) }
  }, [])

  useEffect(() => {
    if (!edited) return
    const url = URL.createObjectURL(edited.blob); setEditedUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [edited])

  const frameAvailable = !editorStarted && record?.kind === "visible" && canFrame(record.profile)
  useEffect(() => {
    if (!record || !frameAvailable || !record.profile) return
    let disposed = false
    let url = ""
    setFraming(true)
    void composeFrame(record.blob, record.profile, record.createdAt, record.appearance).then(blob => {
      if (disposed) return
      url = URL.createObjectURL(blob)
      setFramedUrl(url); setFramedBlob(blob)
    }).catch(() => { if (!disposed) { setWithFrame(false); setError(t("No se pudo preparar el marco. Podés descargar la página sin marco.")) } })
      .finally(() => { if (!disposed) setFraming(false) })
    return () => { disposed = true; if (url) URL.revokeObjectURL(url) }
  }, [record, frameAvailable])

  useEffect(() => {
    const container = canvas.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      const padding = parseFloat(getComputedStyle(container).getPropertyValue("--preview-padding")) * 2
      setCanvasSize({ width: entry.contentRect.width - padding, height: entry.contentRect.height - padding })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [record])

  async function run(action: () => Promise<void>) {
    setWorking(true); setError(""); setMessage("")
    try { await action() }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("No se pudo completar la operación.")) }
    finally { setWorking(false) }
  }

  function toggleEditor() {
    if (!editorStarted) {
      presentationBeforeEditing.current = withFrame
      setEditorBusy(true)
    }
    setEditorStarted(true)
    setWithFrame(false)
    setEditing(!editing)
  }

  function cancelEditing() {
    setEditing(false)
    setEditorStarted(false)
    setEditorBusy(false)
    setEdited(undefined)
    setEditedUrl("")
    setWithFrame(presentationBeforeEditing.current)
    setError("")
    setCopied(false)
    setDownloaded(false)
  }

  async function exportBlob(format: ExportFormat) {
    if (editorBusy) throw new Error(t("Esperá a que termine la edición. Si falló, deshacé el último cambio antes de exportar."))
    if (!record) throw new Error(t("La imagen no está disponible."))
    const original = withFrame && frameAvailable && framedBlob ? framedBlob : (edited?.blob ?? record.blob)
    if (format === "png") return original
    if (format === "pdf") return exportPdf(original, record.title, preferences.pdf)
    const bitmap = await createImageBitmap(original)
    try {
      const output = document.createElement("canvas")
      output.width = bitmap.width; output.height = bitmap.height
      const context = output.getContext("2d")
      if (!context) throw new Error(t("No se pudo preparar la imagen. Probá descargando en PNG."))
      context.fillStyle = "#ffffff"; context.fillRect(0, 0, output.width, output.height)
      context.drawImage(bitmap, 0, 0)
      return await new Promise<Blob>((resolve, reject) => output.toBlob(blob => blob ? resolve(blob) : reject(new Error(t("No se pudo convertir a JPEG. Probá con PNG."))), "image/jpeg", preferences.quality / 100))
    } finally { bitmap.close() }
  }

  async function download(format: ExportFormat = preferences.format) {
    if (!record) return
    setDownloaded(false)
    const blob = await exportBlob(format)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url; anchor.download = filename(record, format); anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    setDownloaded(true)
    if (format !== preferences.format) {
      const updated = { ...preferences, format }
      await savePreferences(updated)
      setPreferences(updated)
    }
  }

  if (loading) return <div className="loading-screen"><div className="capture-progress" style={{ width: 320 }}><CaptureProgress state={captureState}/>{isBusy(captureState.stage) ? <Button variant="outline" disabled={working} onClick={() => void run(async () => { await request({ type: "cancel" }) })}>{t("Cancelar captura")}</Button> : <span role="status">{t("Abriendo la captura…")}</span>}</div></div>
  if (!record) return <div className="result-empty"><Brand/><Empty><EmptyHeader><EmptyMedia variant="icon"><ImageOff/></EmptyMedia><EmptyTitle>{captureState.stage === "cancelled" ? t("Captura cancelada") : t("Esta captura ya no está disponible")}</EmptyTitle><EmptyDescription>{error || t("Conservamos solo el último resultado mientras su pestaña está abierta. Abrí Encuadre en la página que querés capturar.")}</EmptyDescription></EmptyHeader>{captureState.tabId !== undefined && <Button variant="outline" disabled={working} onClick={() => void run(async () => { await request({ type: "return", tabId: captureState.tabId! }) })}><ArrowLeft data-icon="inline-start"/>{t("Volver al emulador")}</Button>}</Empty></div>
  const dimensions = withFrame && frameAvailable && framedBlob && record.profile ? frameOutputSize(record.profile) : edited ? edited.edit.crop : record
  const shownUrl = withFrame && frameAvailable && framedUrl ? framedUrl : editedUrl || imageUrl
  const widthScale = Math.min(1, Math.max(1, canvasSize.width) / dimensions.width)
  const scale = typeof zoom === "number" ? zoom : zoom === "fit" && withFrame && frameAvailable
    ? Math.min(widthScale, Math.max(1, canvasSize.height) / dimensions.height)
    : widthScale
  const scrollable = dimensions.height * scale > canvasSize.height || dimensions.width * scale > canvasSize.width

  return <div className="result-shell">
    <header className="result-header"><Brand/><span className="result-header-label">{t("Resultado de captura")}</span><Button variant="outline" disabled={working} onClick={() => void run(async () => { await request({ type: "return", tabId: record.tabId }) })}><ArrowLeft data-icon="inline-start"/>{t("Volver a la página")}</Button></header>
    <div className="result-layout">
      <main className="image-workspace" aria-label={t("Vista previa de la captura")}>
        <div className="image-toolbar">
          <div className="preview-actions"><span className="image-toolbar-caption">{editing ? t("Edición") : t("Vista previa")}</span><Button variant="outline" size="sm" disabled={working || framing} onClick={toggleEditor}><Pencil data-icon="inline-start"/>{editing ? t("Ver resultado") : t("Editar captura")}</Button>{editorStarted && <Button variant="ghost" size="sm" disabled={working} onClick={cancelEditing}>{t("Cancelar edición")}</Button>}</div>
          <div className="zoom-controls" role="group" aria-label={t("Ampliación de la vista previa")}>
            <div className="zoom-stepper"><Button variant="ghost" size="icon-sm" aria-label={t("Alejar imagen")} disabled={scale <= 0.1} onClick={() => setZoom(Math.max(0.1, scale - 0.1))}><Minus/></Button><output aria-label={t("Ampliación de la imagen")}>{Math.round(scale * 100)} %</output><Button variant="ghost" size="icon-sm" aria-label={t("Acercar imagen")} disabled={scale >= 2} onClick={() => setZoom(Math.min(2, scale + 0.1))}><Plus/></Button></div>
            <div className="zoom-presets"><Button variant="ghost" size="sm" onClick={() => setZoom("fit")} aria-pressed={zoom === "fit"}><Maximize data-icon="inline-start"/>{withFrame && frameAvailable ? t("Ver completo") : t("Ajustar al ancho")}</Button>{withFrame && frameAvailable && <Button variant="ghost" size="sm" onClick={() => setZoom("width")} aria-pressed={zoom === "width"}>{t("Al ancho")}</Button>}<Button variant="ghost" size="sm" onClick={() => setZoom(1)} aria-pressed={zoom === 1}>1:1</Button></div>
          </div>
        </div>
        <div className="image-viewport" ref={canvas}>
          {editorStarted && <div className="editor-host" hidden={!editing}><CaptureEditor source={record.blob} width={record.width} height={record.height} scale={scale} onBusy={setEditorBusy} onChange={(blob, edit) => setEdited({ blob, edit })} onError={setError}/></div>}
          <div className="image-scroll" hidden={editing} tabIndex={0} role="region" aria-label={t("Imagen capturada")} aria-describedby="preview-caption"><div className="image-stage" style={{ width: `calc(${dimensions.width * scale}px + 2 * var(--preview-padding))` }}><img className="captured-image" src={shownUrl} alt={withFrame && frameAvailable ? t("Captura de {title} con marco", { title: record.title }) : t("Captura de {title}", { title: record.title })} width={dimensions.width} height={dimensions.height} style={{ width: dimensions.width * scale, height: dimensions.height * scale }}/></div></div>
        </div>
        <div className="image-caption" id="preview-caption"><span>{t("{width} × {height} píxeles", { width: formatNumber(dimensions.width), height: formatNumber(dimensions.height) })}{record.partial ? ` · ${t("Captura parcial")}` : ""}</span><span>{editing ? t("Los cambios se aplican al descargar") : scrollable ? t("Desplazate para recorrer la captura") : t("Captura completa a la vista")}</span></div>
      </main>
      <aside className="result-sidebar">
        <div className="result-summary"><Badge variant="secondary">{record.kind === "full" ? t("Página completa") : t("Pantalla visible")}</Badge><h1>{t("Tu captura, lista.")}</h1><p className="result-site">{new URL(record.url).host}</p></div>
        <section className="export-section"><h2>{t("Guardá tu captura")}</h2>
          {frameAvailable && <FieldGroup><Field><FieldLabel>{t("Presentación")}</FieldLabel><ToggleGroup type="single" variant="outline" value={withFrame ? "frame" : "page"} disabled={working || framing || editorBusy} onValueChange={value => { if (value) setWithFrame(value === "frame") }} aria-label={t("Presentación de la captura")}><ToggleGroupItem value="frame">{t("Con marco")}</ToggleGroupItem><ToggleGroupItem value="page">{t("Solo página")}</ToggleGroupItem></ToggleGroup></Field></FieldGroup>}
          {preferences.format === "jpeg" && <ExportOptions preferences={preferences} disabled={working || framing || editorBusy} onChange={value => void run(async () => { await savePreferences(value); setPreferences(value) })}/>}
          <details className="result-details" open={preferences.format === "pdf" || undefined}><summary>{t("Opciones de PDF")}<ChevronDown aria-hidden="true"/></summary><PdfExportOptions value={preferences.pdf} disabled={working || framing || editorBusy} onChange={pdf => void run(async () => { const value = { ...preferences, pdf }; await savePreferences(value); setPreferences(value) })}/></details>
          <div className="download-actions" role="group" aria-label={t("Descargar captura")}>
            <Button size="lg" className="download-primary" data-downloaded={downloaded} aria-label={t("Descargar {format}", { format: preferences.format === "jpeg" ? "JPG" : preferences.format.toUpperCase() })} disabled={working || framing || editorBusy} onClick={() => void run(() => download())}>
              <span className="download-labels" aria-hidden="true"><span className="download-idle"><Download data-icon="inline-start"/>{t("Descargar {format}", { format: preferences.format === "jpeg" ? "JPG" : preferences.format.toUpperCase() })}</span><span className="download-success"><Check data-icon="inline-start"/>{t("Descarga iniciada")}</span></span>
            </Button>
            <span role="status" className="sr-only">{downloaded ? t("Descarga iniciada. Revisá las descargas de tu navegador.") : ""}</span>
            <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon-lg" className="download-menu-trigger" aria-label={t("Más opciones de descarga")} disabled={working || framing || editorBusy}><ChevronDown/></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem onSelect={() => void run(() => download("png"))}>{t("Descargar PNG")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void run(() => download("jpeg"))}>{t("Descargar JPG")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void run(() => download("pdf"))}>{t("Descargar PDF")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="result-copy-group"><Button variant="outline" className="w-full copy-image-button" data-copied={copied} aria-label={copied ? t("Imagen copiada") : t("Copiar imagen")} disabled={working || framing || editorBusy} onClick={() => void run(async () => {
            setCopied(false)
            if (editorBusy) throw new Error(t("La edición todavía no está lista para copiar."))
            if (!navigator.clipboard?.write) throw new Error(t("Este navegador no permite copiar imágenes. Usá Descargar para guardar la captura."))
            try { await navigator.clipboard.write([new ClipboardItem({ "image/png": withFrame && frameAvailable && framedBlob ? framedBlob : (edited?.blob ?? record.blob) })]); setCopied(true) }
            catch { throw new Error(t("No se pudo copiar la imagen. Usá Descargar para guardarla.")) }
          })}>
            <span className="copy-image-labels" aria-hidden="true">
              <span className="copy-image-idle"><Clipboard data-icon="inline-start"/>{t("Copiar imagen")}</span>
              <span className="copy-image-success"><Check data-icon="inline-start"/>{t("Imagen copiada")}</span>
            </span>
          </Button>
          <p className="fine-print">{t("Se copia en PNG para conservar la calidad.")}</p></div>
          <Button variant="outline" className="w-full" disabled={working || framing || editorBusy} onClick={() => void run(async () => { await printCapture(shownUrl, record.title, preferences.pdf) })}><Printer data-icon="inline-start"/>{t("Imprimir")}</Button>
        </section>
        {editorStarted && <p className="fine-print">{t("La edición se descarga sin marco. Los cambios duran mientras esta pestaña siga abierta.")}</p>}
        {message && <p role="status" className="status-line"><Check/>{message}</p>}
        {error && <Alert variant="destructive"><Info/><AlertTitle>{t("No se pudo completar")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {record.warnings.length > 0 && <Alert><Info/><AlertTitle>{record.partial ? t("El resultado es parcial") : t("Sobre esta captura")}</AlertTitle><AlertDescription><ul className="warning-list">{record.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></AlertDescription></Alert>}
        <details className="result-details"><summary>{t("Detalles de la captura")}<ChevronDown aria-hidden="true"/></summary><p className="fine-print result-page-title">{record.title}</p><dl className="capture-details"><div><dt>{t("Imagen")}</dt><dd>{formatNumber(dimensions.width)} × {formatNumber(dimensions.height)} px</dd></div><div><dt>{t("Perfil")}</dt><dd>{record.profile?.name ?? t("Vista de escritorio")}</dd></div><div><dt>{t("Página")}</dt><dd>{record.cssWidth} × {record.cssHeight} CSS px</dd></div><div><dt>{t("Capturada")}</dt><dd>{new Date(record.createdAt).toLocaleString(locale === "es" ? "es-AR" : "en", { dateStyle: "short", timeStyle: "short" })}</dd></div></dl></details>
        <Button variant="ghost" className="w-full justify-start" disabled={working} onClick={() => void run(async () => { await request({ type: "return", tabId: record.tabId, repeat: true, kind: record.kind }); setMessage(t("Captura iniciada en la página de origen")) })}><RotateCw data-icon="inline-start"/>{t("Repetir captura")}</Button>
        <p className="privacy-note"><ShieldCheck/>{t("Solo en tu equipo. El resultado temporal se elimina al cerrar su pestaña o hacer otra captura.")}</p>
      </aside>
    </div>
  </div>
}

createRoot(document.getElementById("root")!).render(<Result/>)
