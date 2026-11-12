// This is (almost) directly from Node.js utils
// https://github.com/joyent/node/blob/f8c335d0caf47f16d31413f89aa28eda3878e3aa/lib/util.js

import { inspect as _inspect } from '../internal/loupe/index.js'
import { config } from '../config.js'

export function inspect(obj, showHidden, depth, colors) {
  let options = {
    colors: colors,
    depth: typeof depth === 'undefined' ? 2 : depth,
    showHidden: showHidden,
    truncate: config.truncateThreshold ? config.truncateThreshold : Infinity,
  }
  return _inspect(obj, options)
}
