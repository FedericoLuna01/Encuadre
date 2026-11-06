import { t, locale } from "@/lib/i18n"
import { profiles, type Profile } from "./model"

export function profileGroups(customProfiles: Profile[]) {
  const groups = new Map<string, { label: string; order: number; profiles: Profile[] }>()
  for (const profile of [...profiles.filter(p => p.kind === "phone" || p.kind === "tablet"), ...customProfiles]) {
    const generation = /^iphone-(\d+)/.exec(profile.id)?.[1]
    const family = profile.kind === "custom" ? { label: t("Tus tamaños"), order: 0 }
      : profile.id === "iphone-air" ? { label: "iPhone 17", order: 117 }
      : generation ? { label: `iPhone ${generation}`, order: 100 + Number(generation) }
      : profile.id.startsWith("iphone-x") ? { label: "iPhone X / XR / XS", order: 110 }
      : profile.id.startsWith("iphone-se") ? { label: "iPhone SE", order: 100 }
      : profile.kind === "tablet" ? { label: t("Tablets"), order: 80 }
      : { label: "Android", order: 90 }
    const group = groups.get(family.label) ?? { ...family, profiles: [] }
    group.profiles.push(profile)
    groups.set(family.label, group)
  }
  const variantOrder = (id: string) => id === "iphone-air" ? 50 : id.endsWith("pro-max") ? 40 : id.endsWith("pro") ? 30 : id.endsWith("plus") ? 20 : id.endsWith("mini") ? 10 : 0
  return [...groups.values()].sort((a, b) => b.order - a.order).map(group => ({
    ...group,
    profiles: group.profiles.slice().sort((a, b) => variantOrder(a.id) - variantOrder(b.id) || a.name.localeCompare(b.name, locale, { numeric: true })),
  }))
}
