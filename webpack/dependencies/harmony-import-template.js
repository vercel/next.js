import { requireValue } from '../utils'

export default class HarmonyImportDependencyTemplate {
  apply (dep, source, outputOptions, requestShortener) {
    const content = makeImportStatement(
      true,
      dep,
      outputOptions,
      requestShortener
    )
    source.replace(dep.range[0], dep.range[1] - 1, '')
    source.insert(-1, content)
  }
};

function makeImportStatement (declare, dep, outputOptions, requestShortener) {
  const newline = declare ? '\n' : ' '

  if (!dep.module) {
    const stringifiedError = JSON.stringify(
      `Cannot find module "${dep.request}"`
    )
    return `throw new Error(${stringifiedError});${newline}`
  }

  if (dep.importedVar) {
    const declaration = `${declare ? 'var ' : ''}${dep.importedVar}`
    const request = requireValue(dep, requestShortener)
    const isHarmonyModule =
      dep.module.meta &&
      dep.module.meta.harmonyModule &&
      !/node_modules/.test(dep.module.resource)

    const content = `/* harmony import */ ${
      declaration
    } = __webpack_require__(${
      request
    });\n`

    if (isHarmonyModule) {
      return content
    }

    return `${content}/* harmony import */ ${
      declaration
    }_default = __webpack_require__.n(${
      dep.importedVar
    });${newline}`
  }

  return ''
}
