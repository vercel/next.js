/*
 * Partially adapted from @babel/core (MIT license).
 *
 * Original contributors:
 */

// TODO: ncc this
// eslint-disable-next-line
import traverse from '@babel/traverse'
// TODO: ncc this
// eslint-disable-next-line
import generate from '@babel/generator'
import normalizeFile from '@babel/core/lib/transformation/normalize-file'
import normalizeOpts from '@babel/core/lib/transformation/normalize-opts'
import loadBlockHoistPlugin from '@babel/core/lib/transformation/block-hoist-plugin'
import PluginPass from '@babel/core/lib/transformation/plugin-pass'

import getConfig from './get-config'
import { consumeIterator } from './util'

function getTraversalParams(file, pluginPairs) {
  const passPairs = []
  const passes = []
  const visitors = []

  for (const plugin of pluginPairs.concat(loadBlockHoistPlugin())) {
    const pass = new PluginPass(file, plugin.key, plugin.options)
    passPairs.push([plugin, pass])
    passes.push(pass)
    visitors.push(plugin.visitor)
  }

  return { passPairs, passes, visitors }
}

function invokePluginPre(file, passPairs) {
  for (const [{ pre }, pass] of passPairs) {
    if (pre) {
      pre.call(pass, file)
    }
  }
}

function invokePluginPost(file, passPairs) {
  for (const [{ post }, pass] of passPairs) {
    if (post) {
      post.call(pass, file)
    }
  }
}

function transformAst(file, babelConfig) {
  for (const pluginPairs of babelConfig.passes) {
    const { passPairs, passes, visitors } = getTraversalParams(
      file,
      pluginPairs
    )
    invokePluginPre(file, passPairs)
    const visitor = traverse.visitors.merge(
      visitors,
      passes,
      file.opts.wrapPluginVisitorMethod
    )
    traverse(file.ast, visitor, file.scope)
    invokePluginPost(file, passPairs)
  }
}

export default function transform(
  source,
  inputSourceMap,
  loaderOptions,
  filename,
  target
) {
  const babelConfig = getConfig({
    source,
    loaderOptions,
    inputSourceMap,
    target,
    filename,
  })
  const file = consumeIterator(
    normalizeFile(babelConfig.passes, normalizeOpts(babelConfig), source)
  )
  transformAst(file, babelConfig)
  const { code, map } = generate(file.ast, file.opts.generatorOpts, file.code)
  return { code, map }
}
