import { t } from "./i18n"
import type { PageAppearance, Profile } from "./model"
import { deviceInsets, deviceViewport, frameAsset } from "./device-viewport"

export function canFrame(profile: Profile | null | undefined): boolean {
  return !!profile && (profile.kind === "phone" || profile.kind === "tablet") && frameAsset(profile) !== null
}

export function frameGeometry(profile: Profile) {
  const asset = frameAsset(profile)
  const viewport = deviceViewport(profile)
  const inset = deviceInsets(profile)
  if (!asset) return { width: profile.width, height: profile.height, x: 0, y: 0, screenX: 0, screenY: 0, status: 0, bottom: 0, contentWidth: viewport.width, contentHeight: viewport.height }
  const sx = profile.width / asset.screen.width
  const sy = profile.height / asset.screen.height
  return {
    width: asset.width * sx, height: asset.height * sy,
    x: asset.screen.x * sx, y: asset.screen.y * sy + inset.top,
    screenX: asset.screen.x * sx, screenY: asset.screen.y * sy,
    status: inset.top, bottom: inset.bottom,
    contentWidth: viewport.width, contentHeight: viewport.height,
  }
}

export function frameOutputSize(profile: Profile) {
  const g = frameGeometry(profile)
  return { width: Math.round(g.width * 2), height: Math.round(g.height * 2) }
}

function escapeXml(value: string) { return value.replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!) }

// Hardware/cameras come from the model's bundled photograph. Preview and export
// share the same pixel mask; only the system indicators are drawn as vectors.
function systemInk(background: string) {
  const channels = background.slice(1).match(/../g)?.map(value => parseInt(value, 16) / 255)
  if (!channels || channels.length !== 3) return "#171917"
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722 > 0.179 ? "#171917" : "#ffffff"
}

export function systemChromeSvg(profile: Profile, time = "9:41", appearance?: PageAppearance) {
  const g = frameGeometry(profile)
  const legacy = deviceInsets(profile).bottom === 0
  const android = !profile.id.startsWith("iphone-") && profile.kind !== "tablet"
  const sx = g.screenX, sy = g.screenY
  const font = legacy || android ? 13 : 16
  const textX = sx + (legacy || android ? 18 : 34)
  const baseline = sy + g.status / 2 + font * 0.35
  const theme = /^#[0-9a-f]{6}$/i.test(appearance?.themeColor ?? "") ? appearance!.themeColor : "#ffffff"
  const background = /^#[0-9a-f]{6}$/i.test(appearance?.backgroundColor ?? "") ? appearance!.backgroundColor : "#ffffff"
  const ink = systemInk(theme)
  const homeInk = systemInk(background)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${g.width}" height="${g.height}" viewBox="0 0 ${g.width} ${g.height}">
    <rect x="${sx}" y="${sy}" width="${profile.width}" height="${profile.height}" fill="${background}"/>
    <rect x="${sx}" y="${sy}" width="${profile.width}" height="${g.status}" fill="${theme}"/>
    <text x="${textX}" y="${baseline}" font-family="Arial,sans-serif" font-size="${font}" font-weight="600" fill="${ink}">${escapeXml(time)}</text>
    <g transform="translate(${sx + profile.width - (legacy ? 83 : 95)},${baseline - 11})" fill="${ink}">
      <rect x="0" y="8" width="3" height="4" rx=".8"/><rect x="5" y="5" width="3" height="7" rx=".8"/><rect x="10" y="2" width="3" height="10" rx=".8"/><rect x="15" width="3" height="12" rx=".8"/>
      <path d="M25 3 Q33 -3 41 3 M28 6 Q33 2 38 6 M31 9 Q33 7 35 9" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round"/><circle cx="33" cy="12" r="1.3"/>
      <rect x="49" y="0" width="23" height="12" rx="3.5" fill="none" stroke="${ink}" stroke-opacity=".5" stroke-width="1.2"/><rect x="51" y="2" width="18" height="8" rx="2"/><path d="M74 4v4" stroke="${ink}" stroke-opacity=".5" stroke-width="2" stroke-linecap="round"/>
    </g>
    ${g.bottom ? `<rect x="${sx + profile.width / 2 - 61}" y="${sy + profile.height - 12}" width="122" height="4" rx="2" fill="${homeInk}"/>` : ""}
  </svg>`
}

async function loadImage(src: string) {
  const image = new Image()
  image.src = src
  await image.decode()
  return image
}

export async function composeFrame(blob: Blob, profile: Profile, date: string, appearance?: PageAppearance): Promise<Blob> {
  const asset = frameAsset(profile)
  if (!asset) throw new Error(t("Este dispositivo no tiene un marco disponible."))
  const g = frameGeometry(profile)
  const output = frameOutputSize(profile)
  const contentUrl = URL.createObjectURL(blob)
  const time = new Date(date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
  try {
    const [content, hardware, mask, chrome] = await Promise.all([
      loadImage(contentUrl), loadImage(asset.frame), loadImage(asset.mask),
      loadImage(`data:image/svg+xml,${encodeURIComponent(systemChromeSvg(profile, time, appearance))}`),
    ])
    const canvas = document.createElement("canvas")
    canvas.width = output.width; canvas.height = output.height
    const context = canvas.getContext("2d")
    if (!context) throw new Error(t("No se pudo preparar la imagen con marco."))
    context.scale(output.width / g.width, output.height / g.height)
    context.drawImage(chrome, 0, 0, g.width, g.height)
    const sourceHeight = content.naturalWidth * g.contentHeight / g.contentWidth
    context.drawImage(content, 0, 0, content.naturalWidth, sourceHeight, g.x, g.y, g.contentWidth, g.contentHeight)
    context.globalCompositeOperation = "destination-in"
    context.drawImage(mask, 0, 0, g.width, g.height)
    context.globalCompositeOperation = "source-over"
    context.drawImage(hardware, 0, 0, g.width, g.height)
    return await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error(t("No se pudo exportar el marco."))), "image/png"))
  } finally { URL.revokeObjectURL(contentUrl) }
}
