// Renders every diagram module in ./diagrams to <name>-<theme>.html and
// <theme>/<name>.svg. render.sh screenshots the HTML files at 2x.
//
// A diagram module default-exports one or more { name, width, height, draw }
// objects; draw(t, lib) returns the SVG body for theme `t`.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as lib from './lib.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = process.cwd()
const only = process.argv[2] // optional: render a single diagram by name

const dir = path.join(here, 'diagrams')
if (!fs.existsSync(dir)) {
  console.error(
    `No diagrams/ folder next to gen.mjs. Add diagrams/<name>.mjs (see SKILL.md).`
  )
  process.exit(1)
}
for (const file of fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.mjs'))
  .sort()) {
  const mod = await import(pathToFileURL(path.join(dir, file)).href)
  if (!mod.default) continue // a helper module shared between diagrams
  const diagrams = [].concat(mod.default)
  for (const d of diagrams) {
    if (only && d.name !== only) continue
    for (const [theme, t] of Object.entries(lib.themes)) {
      const width = d.width ?? 1600
      const svg = lib.canvas(
        t,
        width,
        d.height,
        d.draw(t, lib, { width, height: d.height })
      )
      fs.mkdirSync(path.join(out, theme), { recursive: true })
      fs.writeFileSync(
        path.join(out, `${d.name}-${theme}.html`),
        lib.html(t, svg)
      )
      fs.writeFileSync(path.join(out, theme, `${d.name}.svg`), svg)
    }
    console.log(`generated ${d.name} (${d.width ?? 1600}×${d.height})`)
  }
}
