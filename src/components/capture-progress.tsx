import { t } from "@/lib/i18n"
import { Progress } from "@/components/ui/progress"
import type { CaptureState } from "@/lib/model"

const stageLabels: Partial<Record<CaptureState["stage"], string>> = {
  preparing: t("Preparando la página"),
  scrolling: t("Recorriendo la página"),
  capturing: t("Armando tu captura"),
  saving: t("Todo listo, abriendo…"),
}

export function CaptureProgress({ state }: { state: CaptureState }) {
  const progress = Math.min(100, Math.max(0, state.progress))

  return <div className="capture-activity" data-stage={state.stage}>
    <div className="capture-activity-preview" aria-hidden="true">
      <div className="capture-mini-page">
        <div className="capture-mini-toolbar"><i/><i/><i/></div>
        <div className="capture-mini-content" style={{ transform: `translateY(-${progress * .55}%)` }}>
          {[0, 1, 2].map(section => <div className="capture-mini-section" key={section}><b/><span/><span/><em/><span/><span/></div>)}
        </div>
        <div className="capture-mini-scan"/>
      </div>
      <div className="capture-activity-copy"><strong>{stageLabels[state.stage] ?? t("Captura en curso")}</strong><span>{t("Podés cancelarla cuando quieras.")}</span></div>
    </div>
    <div className="capture-activity-status"><span role="status">{state.message}</span><span className="capture-activity-percent">{Math.round(progress)} %</span></div>
    <Progress className="capture-activity-bar" value={progress} aria-label={t("Progreso de captura")}/>
  </div>
}
