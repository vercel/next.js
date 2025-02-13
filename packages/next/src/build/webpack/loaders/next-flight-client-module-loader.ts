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
    let prefix = ''
    if (process.env.BUILTIN_FLIGHT_CLIENT_ENTRY_PLUGIN) {
      const rscModuleInformationJson = JSON.stringify(buildInfo.rsc)
      prefix = `/* __rspack_internal_rsc_module_information_do_not_use__ ${rscModuleInformationJson} */\n`
      source = prefix + source
    }

    // This is a server action entry module in the client layer. We need to
    // create re-exports of "virtual modules" to expose the reference IDs to the
    // client separately so they won't be always in the same one module which is
    // not splittable. This server action module tree shaking is only applied in
    // production mode. In development mode, we want to preserve the original
    // modules (as transformed by SWC) to ensure that source mapping works.
    if (buildInfo.rsc.actionIds && process.env.NODE_ENV === 'production') {
      return (
        prefix +
        Object.entries(buildInfo.rsc.actionIds)
          .map(([id, name]) => {
            return `export { ${name} } from 'next-flight-server-reference-proxy-loader?id=${id}&name=${name}!'`
          })
          .join('\n')
      )
    }

    return this.callback(null, source, sourceMap)
  }

export default flightClientModuleLoader
