/*
  MIT License http://www.opensource.org/licenses/mit-license.php
  Author Tobias Koppers @sokra
*/

'use strict'

import WebpackMissingModule from 'webpack/lib/dependencies/WebpackMissingModule'
import { requireValue } from '../utils'

export default class RequireContextDependencyTemplate {
  apply (dep, source, outputOptions, requestShortener) {
    if (!dep.range) {
      return
    }

    const request = requireValue(dep, requestShortener)
    let content
    if (dep.module) {
      content = `__webpack_require__(${request})`
    } else {
      content = WebpackMissingModule.module(request)
    }
    source.replace(dep.range[0], dep.range[1] - 1, content)
  }
}
