import { t } from "./i18n"
import type { Reply, Request } from "./model"

export const inExtension = !!globalThis.chrome?.runtime?.id

export async function request(message: Request) {
  if (!inExtension) throw new Error(t("Cargá la carpeta dist como extensión en Chrome para conectar una página."))
  const reply: Reply = await chrome.runtime.sendMessage(message)
  if (!reply.ok) throw new Error(reply.error)
  return reply.state
}

