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

function transformAstPass(file, pluginPairs, parentSpan) {
  const { passPairs, passes, visitors } = getTraversalParams(file, pluginPairs)

  invokePluginPre(file, passPairs)
  const visitor = traverse.visitors.merge(
    visitors,
    passes,
    file.opts.wrapPluginVisitorMethod
  )

  parentSpan
    .traceChild('babel-turbo-traverse')
    .traceFn(() => traverse(file.ast, visitor, file.scope))

  invokePluginPost(file, passPairs)
}

function transformAst(file, babelConfig, parentSpan) {
  for (const pluginPairs of babelConfig.passes) {
    transformAstPass(file, pluginPairs, parentSpan)
  }
}

export default function transform(
  source,
  inputSourceMap,
  loaderOptions,
  filename,
  target,
  // TODO expect span ID when running in worker thread
  parentSpan
) {
  const getConfigSpan = parentSpan.traceChild('babel-turbo-get-config')
  const babelConfig = getConfig.call(this, {
    source,
    loaderOptions,
    inputSourceMap,
    target,
    filename,
  })
  getConfigSpan.stop()

  const normalizeSpan = parentSpan.traceChild('babel-turbo-normalize-file')
  const file = consumeIterator(
    normalizeFile(babelConfig.passes, normalizeOpts(babelConfig), source)
  )
  normalizeSpan.stop()

  const transformSpan = parentSpan.traceChild('babel-turbo-transform')
  transformAst(file, babelConfig, transformSpan)
  transformSpan.stop()

  const generateSpan = parentSpan.traceChild('babel-turbo-generate')
  const { code, map } = generate(file.ast, file.opts.generatorOpts, file.code)
  generateSpan.stop()

  return { code, map }
}
