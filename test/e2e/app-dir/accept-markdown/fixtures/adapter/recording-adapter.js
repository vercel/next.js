// Records what Next hands every adapter, without serving anything.
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

module.exports = {
  name: 'accept-markdown-recording-adapter',
  async onBuildComplete({ routing, outputs, projectDir }) {
    const prerenders = outputs.prerenders
      .filter((o) => o.fallback?.filePath)
      .map((o) => ({
        pathname: o.pathname,
        filePath: o.fallback.filePath,
        initialHeaders: o.fallback.initialHeaders ?? {},
        initialRevalidate: o.fallback.initialRevalidate,
      }))
    writeFileSync(
      join(projectDir, 'adapter-output.json'),
      JSON.stringify({ beforeFiles: routing.beforeFiles, prerenders }, null, 2)
    )
  },
}
