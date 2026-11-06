import { t, isStaticMessage } from "@/lib/i18n"
import assets from "./frame-assets.json"
import iphoneModels from "./iphone-models.json"
import type { Profile } from "./model"

export function frameAsset(profile: Profile) {
  const model = iphoneModels.find(model => model.id === profile.id)
  const variant = model?.colors.find(color => color.id === profile.color)
  const id = variant && variant.id !== model?.defaultColor ? variant.asset : profile.id
  if (!Object.hasOwn(assets, id)) return null
  const asset = assets[id as keyof typeof assets]
  return profile.width > profile.height ? asset.landscape : asset
}


export function frameColors(profile: Profile) {
  const model = iphoneModels.find(model => model.id === profile.id)
  return model ? { colors: model.colors.map(color => ({ ...color, name: isStaticMessage(color.name) ? t(color.name) : color.name })), selected: model.colors.some(color => color.id === profile.color) ? profile.color! : model.defaultColor } : null
}

export function deviceInsets(profile: Profile) {
  if (!frameAsset(profile)) return { top: 0, bottom: 0 }
  const model = iphoneModels.find(model => model.id === profile.id)
  if (model) return profile.width > profile.height ? { top: 24, bottom: model.bottom ? 24 : 0 } : { top: model.top, bottom: model.bottom }
  if (profile.width > profile.height) return { top: 24, bottom: profile.id === "iphone-se" ? 0 : 24 }
  if (profile.id === "iphone-se") return { top: 20, bottom: 0 }
  if (profile.kind === "tablet") return { top: 24, bottom: 24 }
  if (profile.id.startsWith("iphone-")) return { top: profile.id === "iphone-13" ? 47 : 59, bottom: 34 }
  return { top: 32, bottom: 24 }
}

export function deviceViewport(profile: Profile) {
  const inset = deviceInsets(profile)
  return { width: profile.width, height: profile.height - inset.top - inset.bottom }
}
