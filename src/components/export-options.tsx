import { t } from "@/lib/i18n"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { Preferences, PdfOptions } from "@/lib/model"

export function ExportOptions({ preferences, onChange, disabled = false }: { preferences: Preferences; onChange: (value: Preferences) => void; disabled?: boolean }) {
  return <FieldGroup className="gap-4">
    {preferences.format === "jpeg" && <Field data-disabled={disabled}>
      <FieldLabel htmlFor="quality">{t("Calidad JPG")} <span className="ml-auto tabular-nums">{preferences.quality} %</span></FieldLabel>
      <Slider id="quality" aria-label={t("Calidad JPG")} min={30} max={100} step={1} value={[preferences.quality]} disabled={disabled} onValueChange={([quality]) => onChange({ ...preferences, quality })}/>
    </Field>}
  </FieldGroup>
}

export function PdfExportOptions({ value, onChange, disabled = false }: { value: PdfOptions; onChange: (value: PdfOptions) => void; disabled?: boolean }) {
  return <FieldGroup className="gap-4">
    <Field data-disabled={disabled}>
      <FieldLabel htmlFor="pdf-layout">{t("Páginas")}</FieldLabel>
      <Select value={value.layout} disabled={disabled} onValueChange={layout => { if (layout === "paged" || layout === "single") onChange({ ...value, layout }) }}>
        <SelectTrigger id="pdf-layout" className="w-full"><SelectValue/></SelectTrigger>
        <SelectContent><SelectGroup><SelectItem value="paged">{t("Hojas A4")}</SelectItem><SelectItem value="single">{t("Una sola página larga")}</SelectItem></SelectGroup></SelectContent>
      </Select>
    </Field>
    {value.layout === "paged" && <>
      <Field data-disabled={disabled}>
        <FieldLabel>{t("Orientación del papel")}</FieldLabel>
        <ToggleGroup type="single" variant="outline" value={value.orientation} disabled={disabled} aria-label={t("Orientación del papel")} onValueChange={orientation => { if (orientation === "portrait" || orientation === "landscape") onChange({ ...value, orientation }) }}>
          <ToggleGroupItem value="portrait">{t("Vertical")}</ToggleGroupItem><ToggleGroupItem value="landscape">{t("Horizontal")}</ToggleGroupItem>
        </ToggleGroup>
      </Field>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor="pdf-margin">{t("Márgenes (mm)")}</FieldLabel>
        <Input id="pdf-margin" type="number" min={0} max={30} step={1} value={value.margin} disabled={disabled} onChange={event => onChange({ ...value, margin: Math.max(0, Math.min(30, Math.round(Number(event.target.value) || 0))) })}/>
      </Field>
    </>}
    <p className="fine-print">{t("El PDF contiene imágenes de la captura; el texto no se puede seleccionar.")}</p>
  </FieldGroup>
}
