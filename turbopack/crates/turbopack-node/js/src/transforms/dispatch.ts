/**
 * Unified entry for Node.js transform workers.
 *
 * Both PostCSS and webpack-loader transforms are evaluated in the same worker
 * pool. Using a single config-independent entry module means a single
 * `get_evaluate_pool` cache key on the Rust side, so all JS transforms share one
 * pool (and one set of subprocesses/threads) instead of spawning a separate pool
 * per PostCSS config.
 *
 * Each request carries a leading `kind` argument selecting the transform; the
 * remaining arguments are forwarded unchanged to that transform's `default`
 * export. There is intentionally no `init`: the webpack-loader transform never
 * had one, and the PostCSS transform now initializes its config sessions lazily
 * per request (keyed by config file), so nothing needs to run once per worker.
 */

import type { Channel as Ipc } from '../types'
import postcssTransform from './postcss'
import webpackTransform from './webpack-loaders'

export default function dispatch(
  ipc: Ipc<any, any>,
  kind: 'postcss' | 'webpack',
  ...args: any[]
) {
  switch (kind) {
    case 'postcss':
      return (postcssTransform as any)(ipc, ...args)
    case 'webpack':
      return (webpackTransform as any)(ipc, ...args)
    default:
      throw new Error(`Unknown transform kind: ${kind}`)
  }
}
