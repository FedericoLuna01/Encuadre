import { readFile } from "node:fs/promises"
import { chromium } from "playwright"
import { fileURLToPath } from "node:url"

// The SVG is the editable source; Chrome's manifest uses the exported PNGs.
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  for (const variant of ["", "disabled-"]) {
    const source = await readFile(new URL(`../public/icons/encuadre${variant ? "-disabled" : ""}.svg`, import.meta.url), "utf8")
    for (const size of [16, 32, 48, 128]) {
      await page.setViewportSize({ width: size, height: size })
      await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${source}`)
      await page.screenshot({ path: fileURLToPath(new URL(`../public/icons/${variant}icon-${size}.png`, import.meta.url)), omitBackground: true })
    }
  }
} finally {
  await browser.close()
}
