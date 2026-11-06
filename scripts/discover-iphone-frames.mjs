// Refresh the source inventory explicitly; the normal build never accesses the network.
import { writeFile } from "node:fs/promises"

const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const colors = {
  black: "Negro", white: "Blanco", blue: "Azul", green: "Verde", pink: "Rosa", red: "Rojo", yellow: "Amarillo", purple: "Morado", gold: "Dorado", silver: "Plata",
  "space-gray": "Gris espacial", "rose-gold": "Oro rosa", "jet-black": "Negro brillante", "matte-black": "Negro mate", midnight: "Medianoche", starlight: "Blanco estrella", graphite: "Grafito", "pacific-blue": "Azul pacífico", "sierra-blue": "Azul sierra", "midnight-green": "Verde noche", coral: "Coral",
  "deep-purple": "Morado oscuro", "space-black": "Negro espacial", "black-titanium": "Titanio negro", "white-titanium": "Titanio blanco", "natural-titanium": "Titanio natural", "blue-titanium": "Titanio azul", "desert-titanium": "Titanio desierto", teal: "Verde azulado", ultramarine: "Azul ultramar", lavender: "Lavanda", "mist-blue": "Azul neblina", sage: "Verde salvia", "cosmic-orange": "Naranja cósmico", "deep-blue": "Azul profundo", "cloud-white": "Blanco nube", "light-gold": "Dorado claro", "sky-blue": "Azul cielo", burgundy: "Bordó", glacier: "Glaciar",
}
const dimensions = {
  "SE (2nd generation)": [375,667],
  "X": [375,812], "XS": [375,812], "XS Max": [414,896], "XR": [414,896], "11": [414,896], "11 Pro": [375,812], "11 Pro Max": [414,896],
  "12": [390,844], "12 Mini": [375,812], "12 Pro": [390,844], "12 Pro Max": [428,926], "13": [390,844], "13 Mini": [375,812], "13 Pro": [390,844], "13 Pro Max": [428,926],
  "14": [390,844], "14 Plus": [428,926], "14 Pro": [393,852], "14 Pro Max": [430,932], "15": [393,852], "15 Plus": [430,932], "15 Pro": [393,852], "15 Pro Max": [430,932],
  "16": [393,852], "16 Plus": [430,932], "16 Pro": [402,874], "16 Pro Max": [440,956], "17": [402,874], "17 Pro": [402,874], "17 Pro Max": [440,956], "Air": [420,912], "18 Pro": [402,874], "18 Pro Max": [440,956],
}
const models = new Map()
function add(model, color, repo, revision, path) {
  const size = dimensions[model]
  if (!size) return
  let id = `iphone-${slug(model)}`
  if (model === "SE") id = "iphone-se-1"
  if (model === "SE (2nd generation)") id = "iphone-se"
  color = slug(color).replace("space-grey", "space-gray").replace("dark-blue", "blue-titanium").replace("gold-titanium", "desert-titanium")
  if (/^14 Pro/.test(model)) color = ({black:"space-black",purple:"deep-purple"})[color] ?? color
  if (model === "5c" && color === "red") color = "pink" // Upstream's filename calls the pink 5c Red.
  if (model === "XR") color = ({silver:"white","space-gray":"black"})[color] ?? color
  const legacy = /^(5|6|7|8|SE)/.test(model)
  const top = legacy ? 20 : /^(16 Pro|17|18|Air)/.test(model) ? 62 : /^(14 Pro|15|16)/.test(model) ? 59 : /Mini/.test(model) ? 50 : /^1[234]/.test(model) ? 47 : 44
  const entry = models.get(id) ?? { id, name: `iPhone ${model.replace("Mini","mini").replace("SE (2nd generation)","SE (2.ª generación)").replace(/^SE$/,"SE (1.ª generación)")}`, width:size[0], height:size[1], top, bottom:legacy ? 0 : 34, colors:[] }
  if (!entry.colors.some(item => item.id === color)) entry.colors.push({id:color,name:colors[color] ?? color,asset:`${id}-${color}`,source:`https://raw.githubusercontent.com/${repo}/${revision}/${path.split("/").map(encodeURIComponent).join("/")}`})
  models.set(id,entry)
}
async function tree(repo) {
  const response = await fetch(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`)
  if (!response.ok) throw new Error(`${repo}: ${response.status}`)
  return response.json()
}
const fastlane = await tree("fastlane/frameit-frames")
for (const item of fastlane.tree) {
  const match = /^latest\/Apple iPhone (.+)\.png$/.exec(item.path)
  if (!match) continue
  const model = Object.keys(dimensions).sort((a,b) => b.length-a.length).find(name => match[1].startsWith(`${name} `))
  if (model) add(model,match[1].slice(model.length+1),"fastlane/frameit-frames",fastlane.sha,item.path)
}
const monkr = await tree("blaineam/Monkr")
for (const item of monkr.tree) {
  const match = /^static\/devices\/iphone-(.+)\/([^/]+)\.png$/.exec(item.path)
  if (!match) continue
  const model = Object.keys(dimensions).find(name => slug(name) === match[1] || name === "Air" && match[1] === "17-air")
  if (model) add(model,match[2],"blaineam/Monkr",monkr.sha,item.path)
}
const defaults = { "iphone-13":"midnight", "iphone-14-pro":"deep-purple", "iphone-15":"pink", "iphone-15-pro":"blue-titanium", "iphone-15-pro-max":"black-titanium", "iphone-16":"black" }
for (const model of models.values()) model.defaultColor = defaults[model.id] ?? model.colors[0].id
await writeFile("scripts/iphone-frame-sources.json",JSON.stringify([...models.values()],null,2)+"\n")
console.log(`${models.size} modelos, ${[...models.values()].reduce((sum,m) => sum+m.colors.length,0)} colores`)
