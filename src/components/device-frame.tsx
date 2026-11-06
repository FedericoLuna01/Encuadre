import { t } from "@/lib/i18n"
import type { HTMLAttributes, RefObject, ReactNode } from "react"
import type { PageAppearance, Profile } from "@/lib/model"
import { canFrame, frameGeometry, systemChromeSvg } from "@/lib/device-frame"
import { frameAsset } from "@/lib/device-viewport"

export function DeviceFrame({ profile, src, scale = 1, screenRef, screenProps, appearance, children }: {
  children?: ReactNode
  appearance?: PageAppearance
  profile: Profile
  src: string
  scale?: number
  screenRef?: RefObject<HTMLDivElement | null>
  screenProps?: HTMLAttributes<HTMLDivElement>
}) {
  const framed = canFrame(profile)
  const g = framed ? frameGeometry(profile) : { width: profile.width, height: profile.height, x: 0, y: 0 }
  const viewport = framed ? frameGeometry(profile) : { contentWidth: profile.width, contentHeight: profile.height }
  const asset = frameAsset(profile)
  return <div className="device-frame-size" style={{ width: g.width * scale, height: g.height * scale }}>
    <div className="device-frame" style={{ width: g.width, height: g.height, transform: `scale(${scale})` }}>
      <div className="device-glass" style={asset ? { maskImage: `url(${asset.mask})`, maskSize: "100% 100%" } : undefined}>
        {framed && <img className="device-chrome" src={`data:image/svg+xml,${encodeURIComponent(systemChromeSvg(profile, "9:41", appearance))}`} width={g.width} height={g.height} alt={t("Hora, señal, Wi-Fi y batería")} draggable={false}/>}
        <div className="device-screen" ref={screenRef} style={{ left: g.x, top: g.y, width: viewport.contentWidth, height: viewport.contentHeight }} {...screenProps}>
          {src && <img src={src} width={viewport.contentWidth} height={viewport.contentHeight} alt={t("Página en {name}", { name: profile.name })} draggable={false}/>}
          {children}
        </div>
      </div>
      {framed && asset && <img className="device-shell" src={asset.frame} width={g.width} height={g.height} alt={t("Marco de {name} con barra de estado", { name: profile.name })} draggable={false}/>}
    </div>
  </div>
}
