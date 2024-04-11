import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { getRSCModuleInformation } from '../../analysis/get-page-static-info'
import { getModuleBuildInfo } from './get-module-build-info'

const flightClientModuleLoader: webpack.LoaderDefinitionFunction =
  function transformSource(this, source: string, sourceMap: any) {
    // Avoid buffer to be consumed
    if (typeof source !== 'string') {
      throw new Error('Expected source to have been transformed to a string.')
    }

    if (!this._module) {
      return source
    }
    // Assign the RSC meta information to buildInfo.
    const buildInfo = getModuleBuildInfo(this._module)
    buildInfo.rsc = getRSCModuleInformation(source, false)

    // This is a server action entry module in the client layer. We need to attach
    // noop exports of `callServer` wrappers for each action.
    if (buildInfo.rsc.actions) {
      return `
import { callServer } from 'next/dist/client/app-call-server'

function __build_action__(action, args) {
  return callServer(action.$$id, args)
}

${source}
`
    }

    return this.callback(null, source, sourceMap)
  }

export default flightClientModuleLoader
