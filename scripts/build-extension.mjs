import { build } from "esbuild"
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises"
import { resolve, join, dirname } from "node:path"

const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))
const icons = Object.fromEntries([16, 32, 48, 128].map(size => [size, `icons/icon-${size}.png`]))

await build({ entryPoints: ["src/background.ts"], outfile: "dist/background.js", bundle: true, format: "esm", target: "chrome120" })
await mkdir("dist", { recursive: true })
// The source PNGs remain available for import scripts. Ship only catalog assets.
const catalog = JSON.parse(await readFile(new URL("../src/lib/frame-assets.json", import.meta.url), "utf8"))
const used = new Set()
for (const asset of Object.values(catalog)) for (const oriented of [asset, asset.landscape]) {
  used.add(oriented.frame); used.add(oriented.mask)
}
const frames = resolve("dist/frames")
const bundledNames = await readdir(frames)
for (const path of used) {
  if (!path.startsWith("/frames/") || !bundledNames.includes(path.slice("/frames/".length))) throw new Error(`Missing frame asset: ${path}`)
}
for (const name of bundledNames) {
  const path = join(frames, name)
  if (dirname(path) !== frames) throw new Error("Frame path escaped the build directory")
  if (name.endsWith(".png") && !used.has(`/frames/${name}`)) await unlink(path)
}
await writeFile("dist/manifest.json", JSON.stringify({
  manifest_version: 3,
  name: "__MSG_extensionName__",
  short_name: "Encuadre",
  description: "__MSG_extensionDescription__",
  default_locale: "en",
  version,
  icons,
  minimum_chrome_version: "125",
  permissions: ["debugger", "activeTab", "tabs", "scripting", "declarativeNetRequestWithHostAccess", "storage", "clipboardWrite", "contextMenus"],
  action: { default_title: "__MSG_actionTitle__", default_popup: "index.html", default_icon: icons },
  background: { service_worker: "background.js", type: "module" },
  web_accessible_resources: [{ resources: ["simulator.html", "assets/*", "frames/*"], matches: ["http://*/*", "https://*/*"] }],
  commands: { "capture-full-page": { suggested_key: { default: "Alt+Shift+S" }, description: "__MSG_captureFullPage__" } },
}, null, 2))
