import { PNG } from "pngjs"
import { readFile, writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const ids = ["iphone-se", "iphone-13", "iphone-14-pro", "iphone-15", "iphone-15-pro", "iphone-15-pro-max", "iphone-16", "galaxy-s24", "galaxy-s24-ultra", "pixel-8", "ipad-air"]
export async function prepareFrame(id) {
  const path = `public/frames/${id}.png`
  const image = PNG.sync.read(await readFile(path))
  let left = image.width, top = image.height, right = 0, bottom = 0
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    if (image.data[(y * image.width + x) * 4 + 3] > 0) {
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y)
    }
  }
  const frame = new PNG({ width: right - left + 1, height: bottom - top + 1 })
  PNG.bitblt(image, frame, left, top, frame.width, frame.height, 0, 0)
  const mask = new PNG({ width: frame.width, height: frame.height })
  const visited = new Uint8Array(frame.width * frame.height)
  const queue = new Int32Array(visited.length)
  let head = 0, tail = 0
  const seed = Math.floor(frame.height / 2) * frame.width + Math.floor(frame.width / 2)
  if (frame.data[seed * 4 + 3] > 16) throw new Error(`${id}: screen center is not transparent`)
  queue[tail++] = seed; visited[seed] = 1
  let x0 = frame.width, y0 = frame.height, x1 = 0, y1 = 0
  while (head < tail) {
    const at = queue[head++], x = at % frame.width, y = Math.floor(at / frame.width)
    mask.data.set([255, 255, 255, 255], at * 4)
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
    for (const next of [x > 0 ? at - 1 : -1, x + 1 < frame.width ? at + 1 : -1, y > 0 ? at - frame.width : -1, y + 1 < frame.height ? at + frame.width : -1]) {
      if (next >= 0 && !visited[next] && frame.data[next * 4 + 3] <= 16) { visited[next] = 1; queue[tail++] = next }
    }
  }
  if (x0 <= 0 || y0 <= 0 || x1 >= frame.width - 1 || y1 >= frame.height - 1) throw new Error(`${id}: screen mask leaked outside the shell`)
  await writeFile(path, PNG.sync.write(frame))
  await writeFile(`public/frames/${id}-mask.png`, PNG.sync.write(mask))
  function rotate(source) {
    const result = new PNG({ width: source.height, height: source.width })
    for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
      source.data.copy(result.data, (x * result.width + source.height - y - 1) * 4, (y * source.width + x) * 4, (y * source.width + x) * 4 + 4)
    }
    return result
  }
  await writeFile(`public/frames/${id}-landscape.png`, PNG.sync.write(rotate(frame)))
  await writeFile(`public/frames/${id}-landscape-mask.png`, PNG.sync.write(rotate(mask)))
  return {
    frame: `/frames/${id}.png`, mask: `/frames/${id}-mask.png`, width: frame.width, height: frame.height, screen: { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 },
    landscape: { frame: `/frames/${id}-landscape.png`, mask: `/frames/${id}-landscape-mask.png`, width: frame.height, height: frame.width, screen: { x: frame.height - y1 - 1, y: x0, width: y1 - y0 + 1, height: x1 - x0 + 1 } },
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const catalog = JSON.parse(await readFile("src/lib/frame-assets.json", "utf8"))
  for (const id of ids) catalog[id] = await prepareFrame(id)
  await writeFile("src/lib/frame-assets.json", JSON.stringify(catalog, null, 2) + "\n")
}
