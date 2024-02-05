/*
 * Partially adapted from @babel/core (MIT license).
 */

import traverse from 'next/dist/compiled/babel/traverse'
import generate from 'next/dist/compiled/babel/generator'
import normalizeFile from 'next/dist/compiled/babel/core-lib-normalize-file'
import normalizeOpts from 'next/dist/compiled/babel/core-lib-normalize-opts'
import loadBlockHoistPlugin from 'next/dist/compiled/babel/core-lib-block-hoist-plugin'
import PluginPass from 'next/dist/compiled/babel/core-lib-plugin-pass'

import getConfig from './get-config'
import { consumeIterator } from './util'
import type { Span } from '../../../trace'
import type { NextJsLoaderContext } from './types'

function getTraversalParams(file: any, pluginPairs: any[]) {
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

function invokePluginPre(file: any, passPairs: any[]) {
  for (const [{ pre }, pass] of passPairs) {
    if (pre) {
      pre.call(pass, file)
    }
  }
}

function invokePluginPost(file: any, passPairs: any[]) {
  for (const [{ post }, pass] of passPairs) {
    if (post) {
      post.call(pass, file)
    }
  }
}

function transformAstPass(file: any, pluginPairs: any[], parentSpan: Span) {
  const { passPairs, passes, visitors } = getTraversalParams(file, pluginPairs)

  invokePluginPre(file, passPairs)
  const visitor = traverse.visitors.merge(
    visitors,
    passes,
    // @ts-ignore - the exported types are incorrect here
    file.opts.wrapPluginVisitorMethod
  )

  parentSpan
    .traceChild('babel-turbo-traverse')
    .traceFn(() => traverse(file.ast, visitor, file.scope))

  invokePluginPost(file, passPairs)
}

function transformAst(file: any, babelConfig: any, parentSpan: Span) {
  for (const pluginPairs of babelConfig.passes) {
    transformAstPass(file, pluginPairs, parentSpan)
  }
}

export default function transform(
  this: NextJsLoaderContext,
  source: string,
  inputSourceMap: object | null | undefined,
  loaderOptions: any,
  filename: string,
  target: string,
  parentSpan: Span
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
