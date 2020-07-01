import { PluginObj } from '@babel/core'

interface Property {
  message: string
  disallowedImport: string
  disallowedImporters?: string[]
  allowedImporters?: string[]
}

interface IState {
  opts: {
    properties: Property[]
  }
  file: {
    opts: {
      filename: string
    }
  }
}

const pluginName = 'babel-plugin-disallow-imports-plugin'

function shouldThrowError({
  disallowedImporters,
  allowedImporters,
  filename,
}: {
  disallowedImporters?: string[]
  allowedImporters?: string[]
  filename: string
}): boolean {
  if (
    !!disallowedImporters &&
    disallowedImporters.some(
      (importer: string) => filename.indexOf(importer) !== -1
    )
  ) {
    return true
  }

  if (
    !!allowedImporters &&
    allowedImporters.every((importer: string) => filename.indexOf(importer) < 0)
  ) {
    return true
  }

  return false
}

function warn(message: string) {
  console.warn(message)
}

export default function DisallowImportsPlugin(): PluginObj<any> {
  return {
    visitor: {
      ImportDeclaration(path: any, state: IState) {
        if (!state.opts.properties || !Array.isArray(state.opts.properties)) {
          warn(
            `No properties array has been provided to ${pluginName}.\nMake sure to provide an array of properties`
          )
          return
        }

        state.opts.properties.forEach((property) => {
          const {
            message = 'An uknown disallowed import brokes the transpiling...',
            disallowedImport,
            disallowedImporters,
            allowedImporters,
          } = property
          if (!disallowedImport) {
            throw new Error(
              `No disallowedImport has been provided to ${pluginName}.`
            )
          }

          if (!message) {
            warn(`No custom message has been provided.
            \nPlease add a custom error message for more readability.`)
          }

          if (Boolean(disallowedImporters) && Boolean(allowedImporters)) {
            warn(
              `You provided both disallowedImporters and allowedImporters.\nThe ${pluginName} will take only disallowedImporters.`
            )
          }

          const source = path.node.source.value
          if (source !== disallowedImport) {
            return
          }

          const { filename } = state.file.opts
          if (
            shouldThrowError({
              disallowedImporters,
              allowedImporters,
              filename,
            })
          ) {
            throw new Error(message)
          }
        })
      },
    },
  }
}
