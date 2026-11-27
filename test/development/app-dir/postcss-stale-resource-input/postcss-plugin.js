// A PostCSS plugin that behaves like plugins which report the input file as a
// dependency and cache their output by its modification time.
//
// For every run it records the CSS it was given, the content of the input file
// on disk and its mtime, so the test can detect runs with stale input.
const fs = require('fs')
const path = require('path')

const cache = new Map()

module.exports = () => ({
  postcssPlugin: 'stale-resource-probe',
  Once(root, { result }) {
    const from = result.opts.from
    if (!from || !from.endsWith('globals.css')) return

    const source = root.source.input.css
    const disk = fs.readFileSync(from, 'utf8')
    const { mtimeMs } = fs.statSync(from)
    // Kept in the dist dir so writing it doesn't trigger the file watcher.
    const logDir = path.join(path.dirname(from), '..', '.next')
    fs.mkdirSync(logDir, { recursive: true })
    fs.appendFileSync(
      path.join(logDir, 'postcss-invocations.log'),
      JSON.stringify({ source, disk, mtimeMs, stale: source !== disk }) + '\n'
    )

    result.messages.push({
      type: 'dependency',
      plugin: 'stale-resource-probe',
      file: from,
      parent: from,
    })

    const cached = cache.get(from)
    if (cached && cached.mtimeMs === mtimeMs) {
      root.removeAll()
      root.append(cached.css)
    } else {
      cache.set(from, { mtimeMs, css: root.toString() })
    }
  },
})
module.exports.postcss = true
