import { loader } from 'webpack'
import { Parser, Node } from 'acorn'

interface PageConfig {
  amp?: boolean | 'hybrid'
}

const nextPageConfigLoader: loader.Loader = function(source) {
  try {
    const curParser = new Parser({ sourceType: 'module' }, source.toString())
    const tree: { body: Node[] } = curParser.parse() as any

    let config: PageConfig = {}

    for (const node of tree.body) {
      const { type } = node
      if (type !== 'ExportNamedDeclaration') continue

      for (const declaration of (node as any).declaration.declarations) {
        if (declaration.id.name !== 'config') continue

        for (const property of declaration.init.properties) {
          const { name } = property.key
          let { raw: value } = property.value

          if (name === 'amp' && (value === 'true' || value === 'hybrid')) {
            config.amp = value === 'true' ? true : value
            // replace source so we don't continue processing the source un-necessarily
            if (config.amp === true) {
              source = `throw new Error('__NEXT_DROP_CLIENT_FILE__ ${Date.now()}')`
            }
          }
        }
      }
    }
    this.callback(undefined, source)
  } catch (error) {
    if (error) {
      this.callback(new Error(`Error from Terser: ${error.message}`))
      return
    }
  }
  return
}

export default nextPageConfigLoader
