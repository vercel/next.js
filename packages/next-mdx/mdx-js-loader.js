const mdxLoader = require('@mdx-js/loader')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

function interopDefault(mod) {
  return mod.default || mod
}

// Recursively resolve an exports condition value, preferring 'import' then 'default'.
function resolveExportCondition(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    for (const key of ['import', 'default']) {
      if (key in value) {
        const result = resolveExportCondition(value[key])
        if (result) return result
      }
    }
  }
  return null
}

// Extract the ESM entry point from a package.json object.
function resolveEsmEntry(pkg) {
  const { exports: exp, module: mod, main } = pkg
  if (exp) {
    const mainExport = typeof exp === 'string' ? exp : exp['.'] ?? exp
    const resolved = resolveExportCondition(mainExport)
    if (resolved) return resolved
  }
  return mod ?? main ?? 'index.js'
}

async function importPluginForPath(pluginPath, projectRoot) {
  let resolvedPath
  try {
    resolvedPath = require.resolve(pluginPath, { paths: [projectRoot] })
  } catch (e) {
    if (e.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
      // The package defines an `exports` field but has no entry for the
      // `"require"` condition (e.g. an ESM-only package whose exports only
      // include an `"import"` condition). `require.resolve` uses CJS
      // resolution semantics and cannot match those entries.
      //
      // Node.js always includes the absolute path to the package's package.json
      // in the error message. That path was resolved starting from `projectRoot`,
      // so we can use it to find the ESM entry point and import via a file:// URL.
      // A bare import(pluginPath) would resolve from @next/mdx's own location,
      // which fails in pnpm / non-hoisted setups.
      const pkgJsonMatch = e.message.match(/in (.+package\.json)/)
      if (pkgJsonMatch) {
        const pkgJsonPath = pkgJsonMatch[1]
        const pkgDir = path.dirname(pkgJsonPath)
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
        const entry = resolveEsmEntry(pkg)
        const absolutePath = path.resolve(pkgDir, entry)
        return interopDefault(await import(pathToFileURL(absolutePath)))
      }
      // Could not extract the path from the error message — fall back to a bare
      // import (may fail in strict pnpm / non-hoisted setups).
      return interopDefault(await import(pluginPath))
    }
    throw e
  }
  return interopDefault(
    // "use pathToFileUrl to make esm import()s work with absolute windows paths":
    // on windows import("C:\\path\\to\\file") is not valid, so we need to use file:// URLs
    // https://github.com/vercel/next.js/commit/fbf9e12de095e0237d4ba4aa6139d9757bd20be9
    await import(process.platform === 'win32' ? pathToFileURL(resolvedPath) : resolvedPath)
  )
}

async function importPlugin(plugin, projectRoot) {
  if (Array.isArray(plugin) && typeof plugin[0] === 'string') {
    plugin[0] = await importPluginForPath(plugin[0], projectRoot)
  }
  if (typeof plugin === 'string') {
    plugin = await importPluginForPath(plugin, projectRoot)
  }
  return plugin
}

async function getOptions(options, projectRoot) {
  const {
    recmaPlugins = [],
    rehypePlugins = [],
    remarkPlugins = [],
    ...rest
  } = options

  const [updatedRecma, updatedRehype, updatedRemark] = await Promise.all([
    Promise.all(
      recmaPlugins.map((plugin) => importPlugin(plugin, projectRoot))
    ),
    Promise.all(
      rehypePlugins.map((plugin) => importPlugin(plugin, projectRoot))
    ),
    Promise.all(
      remarkPlugins.map((plugin) => importPlugin(plugin, projectRoot))
    ),
  ])

  return {
    ...rest,
    recmaPlugins: updatedRecma,
    rehypePlugins: updatedRehype,
    remarkPlugins: updatedRemark,
  }
}

module.exports = function nextMdxLoader(...args) {
  const options = this.getOptions()
  const callback = this.async().bind(this)
  const loaderContext = this

  getOptions(options, this.context).then((userProvidedMdxOptions) => {
    const proxy = new Proxy(loaderContext, {
      get(target, prop, receiver) {
        if (prop === 'getOptions') {
          return () => userProvidedMdxOptions
        }

        if (prop === 'async') {
          return () => callback
        }

        return Reflect.get(target, prop, receiver)
      },
    })

    mdxLoader.call(proxy, ...args)
  })
}
