import type { webpack } from 'next/dist/compiled/webpack/webpack'

// This is a virtual proxy loader that takes a Server Reference ID and a name,
// creates a module that just re-exports the reference as that name.

const flightServerReferenceProxyLoader: webpack.LoaderDefinitionFunction<{
  id: string
  name: string
}> = function transformSource(this) {
  const { id, name } = this.getOptions()

  return `\
import { createServerReference } from 'private-next-rsc-action-client-wrapper'
export ${
    name === 'default' ? 'default' : `const ${name} =`
  } /*#__PURE__*/createServerReference(${JSON.stringify(id)})`
}

export default flightServerReferenceProxyLoader
