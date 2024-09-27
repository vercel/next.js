import type { webpack } from 'next/dist/compiled/webpack/webpack'

// This is a virtual proxy loader that takes a Server Reference ID and a name,
// creates a module that just re-exports the reference as that name.

const flightServerReferenceProxyLoader: webpack.LoaderDefinitionFunction<{
  id: string
  name: string
}> = function transformSource(this) {
  const { id, name } = this.getOptions()

  // Both the import and the `createServerReference` call are marked as side
  // effect free:
  // - private-next-rsc-action-client-wrapper is matched as `sideEffects: false` in
  //   the Webpack loader
  // - createServerReference is marked as /*#__PURE__*/
  //
  // Because of that, Webpack is able to concatenate the modules and inline the
  // reference IDs recursively directly into the module that uses them.
  return `\
import { createServerReference, callServer, findSourceMapURL } from 'private-next-rsc-action-client-wrapper'
export ${
    name === 'default' ? 'default' : `const ${name} =`
  } /*#__PURE__*/createServerReference(${JSON.stringify(id)}, callServer, undefined, findSourceMapURL, ${JSON.stringify(name)})`
}

export default flightServerReferenceProxyLoader
