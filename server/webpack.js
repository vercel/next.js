import { resolve } from 'path'
import { webpack } from '@healthline/six-million'
import getConfig from './config'

export default async function createCompiler (dir, { buildId = '-', dev = false } = {}) {
  dir = resolve(dir)
  const config = getConfig(dir)
  let sites = []
  if (config.sites) {
    config.sites.forEach(site => {
      sites.push({
        name: site,
        buildId: `${buildId}/${site}`,
        define: { 'process.env.SITE': JSON.stringify(site) }
      })
      sites.push({
        name: `${site}-legacy`,
        buildId: `${buildId}/${site}`,
        isLegacy: true,
        define: { 'process.env.SITE': JSON.stringify(site) }
      })
    })
  } else {
    sites = [ { name: 'default', buildId }, { name: 'default', buildId, isLegacy: true } ]
  }
  const mainJS = dev
    ? require.resolve('../../browser/client/next-dev') : require.resolve('../../browser/client/next')

  // Filter to a single site at dev time for reduced build overhead
  if (dev) {
    if (process.env.SITE) {
      sites = sites.filter(({ name }) => name.startsWith(process.env.SITE))
    } else {
      sites = [ sites[0] ]
    }
  }

  return webpack(sites, {
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
    dev,
    configModule: require.resolve('./config')
  })
}
