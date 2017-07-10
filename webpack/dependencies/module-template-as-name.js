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
      content = request
    } else {
      content = WebpackMissingModule.module(request)
    }
    source.replace(dep.range[0], dep.range[1] - 1, content)
  }
}
