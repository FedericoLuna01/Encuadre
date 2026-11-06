import { readFile, writeFile, access } from "node:fs/promises"
import { prepareFrame } from "./prepare-frames.mjs"

const sources = JSON.parse(await readFile("scripts/iphone-frame-sources.json", "utf8"))
const assets = JSON.parse(await readFile("src/lib/frame-assets.json", "utf8"))
const failures = []
const models = []
for (const model of sources) {
  const colors = []
  for (const color of model.colors) {
    try {
      const path = `public/frames/${color.asset}.png`
      if (!assets[color.asset]) {
        try { await access(path) }
        catch {
          const response = await fetch(color.source, { signal: AbortSignal.timeout(60000) })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          await writeFile(path, Buffer.from(await response.arrayBuffer()))
        }
        assets[color.asset] = await prepareFrame(color.asset)
      }
      colors.push({ id: color.id, name: color.name, asset: color.asset })
    } catch (error) {
      failures.push({model:model.id,color:color.id,error:error.message})
      console.error(`${model.id}/${color.id}: ${error.message}`)
    }
  }
  if (!colors.length) continue
  const defaultColor = colors.some(c => c.id === model.defaultColor) ? model.defaultColor : colors[0].id
  // Keep the original six default bezels; replace the SE's old iPhone 8 stand-in.
  if (model.id === "iphone-se") assets[model.id] = assets[colors.find(c => c.id === defaultColor).asset]
  else assets[model.id] ??= assets[colors.find(c => c.id === defaultColor).asset]
  models.push({id:model.id,name:model.name,width:model.width,height:model.height,top:model.top,bottom:model.bottom,defaultColor,colors})
  await writeFile("src/lib/frame-assets.json", JSON.stringify(assets,null,2)+"\n")
  console.log(`${model.name}: ${colors.length} colores`)
}
await writeFile("src/lib/iphone-models.json",JSON.stringify(models,null,2)+"\n")
await writeFile("test-results/iphone-import-failures.json",JSON.stringify(failures,null,2)+"\n")
console.log(`${models.length} modelos importados; ${failures.length} errores`)
if (failures.length) process.exitCode = 1
