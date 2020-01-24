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
      if (!process.env.SKIP_LEGACY) {
        sites.push({
          name: `${site}-legacy`,
          buildId: `${buildId}/${site}`,
          isLegacy: true,
          define: { 'process.env.SITE': JSON.stringify(site) }
        })
      }
    })
  } else {
    sites = [ { name: 'default', buildId }, { name: 'default', buildId, isLegacy: true } ]
  }
  const mainJS = dev
    ? require.resolve('../../browser/client/next-dev') : require.resolve('../../browser/client/next')

  // Filter to a single site at dev time for reduced build overhead
  if (dev) {
    const sitename = process.env.SITE || sites[0].name
    sites = sites.filter(({ name }) => name.startsWith(sitename))
  }

  return webpack(sites, {
    mainJS: [`./pages/_error.js`, mainJS],

    async entries (entryPages, buildEntry, buildConfig) {
      const entries = {
        'pages/_error.js': buildEntry([])
      }

      // Allow for per-site page filtering
      if (config.filterPages) {
        entryPages = config.filterPages(buildConfig, entryPages)
      }

      for (const p of entryPages) {
        entries[p.replace(/^.*?\/pages\//, 'pages/').replace(/^(pages\/.*)\/index.js$/, '$1')] = buildEntry(p)
      }

      return entries
    },

    dir,
    dev,
    configModule: require.resolve('./config'),
    maxConcurrentWorkers: config.maxConcurrentWorkers
  })
}
