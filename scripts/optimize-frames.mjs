import { readFile, writeFile, readdir, rename } from "node:fs/promises"
import { createHash } from "node:crypto"
import { PNG } from "pngjs"

const directory = new URL("../public/frames/", import.meta.url)
const catalogUrl = new URL("../src/lib/frame-assets.json", import.meta.url)
const names = (await readdir(directory)).filter(name => name.endsWith(".png")).sort((a, b) => a.length - b.length || a.localeCompare(b))
const canonical = new Map()
const aliases = new Map()
let before = 0, after = 0, optimized = 0
for (const [index, name] of names.entries()) {
  const url = new URL(name, directory), original = await readFile(url)
  const image = PNG.sync.read(original)
  // Do not reduce bit depth or discard color profiles from future imports.
  const chunks = new Set()
  for (let offset = 8; offset < original.length;) {
    chunks.add(original.toString("ascii", offset + 4, offset + 8))
    offset += original.readUInt32BE(offset) + 12
  }
  let output = original
  if (original[24] === 8 && [...chunks].every(chunk => ["IHDR", "IDAT", "IEND", "gAMA"].includes(chunk))) {
    const candidates = [PNG.sync.write(image, { deflateStrategy: 0 })]
    if (name.endsWith("-mask.png")) {
      let grayscale = true
      for (let at = 0; at < image.data.length; at += 4) {
        if (image.data[at] !== image.data[at + 1] || image.data[at] !== image.data[at + 2]) { grayscale = false; break }
      }
      if (grayscale) candidates.push(PNG.sync.write(image, { colorType: 4, deflateStrategy: 0 }))
    }
    for (const candidate of candidates) if (candidate.length < output.length) output = candidate
    if (output !== original) {
      const decoded = PNG.sync.read(output)
      if (decoded.width !== image.width || decoded.height !== image.height || decoded.gamma !== image.gamma || !decoded.data.equals(image.data)) throw new Error(`Pixel mismatch: ${name}`)
      const temporary = new URL(`${name}.optimized.tmp`, directory)
      await writeFile(temporary, output)
      await rename(temporary, url)
      optimized++
    }
  }
  before += original.length; after += output.length
  // Equal bytes include dimensions, alpha, and color metadata; no visual guesses.
  const hash = createHash("sha256").update(output).digest("hex")
  const path = `/frames/${name}`
  if (canonical.has(hash)) aliases.set(path, canonical.get(hash))
  else canonical.set(hash, path)
  if ((index + 1) % 50 === 0) console.log(`Verified ${index + 1}/${names.length} PNGs`)
}
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"))
for (const asset of Object.values(catalog)) for (const orientation of [asset, asset.landscape]) {
  orientation.frame = aliases.get(orientation.frame) ?? orientation.frame
  orientation.mask = aliases.get(orientation.mask) ?? orientation.mask
}
const temporaryCatalog = new URL("../src/lib/frame-assets.json.optimized.tmp", import.meta.url)
await writeFile(temporaryCatalog, JSON.stringify(catalog, null, 2) + "\n")
await rename(temporaryCatalog, catalogUrl)
console.log(JSON.stringify({ files: names.length, optimized, before, after, saved: before - after, duplicatePaths: aliases.size }))
