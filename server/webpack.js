import { resolve } from 'path'
import { webpack } from '@healthline/six-million'
import getConfig from './config'

export default async function createCompiler (dir, { buildId = '-', dev = false } = {}) {
  dir = resolve(dir)
  const config = getConfig(dir)
  const mainJS = dev
    ? require.resolve('../../browser/client/next-dev') : require.resolve('../../browser/client/next')

  return webpack({
    mainJS: [`./pages/_error.js`, mainJS],

    async entries (entryPages, buildEntry) {
      const entries = {
        'pages/_error.js': buildEntry([])
      }
      for (const p of entryPages) {
        entries[p.replace(/^.*?\/pages\//, 'pages/').replace(/^(pages\/.*)\/index.js$/, '$1')] = buildEntry(p)
      }

      return entries
    },

    dir,
    buildId,
    dev,
    config
  })
}
