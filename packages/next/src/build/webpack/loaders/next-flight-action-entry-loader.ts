import { generateActionId } from './utils'

export type NextFlightActionEntryLoaderOptions = {
  actions: string
  encryptionKey: string
}

function nextFlightActionEntryLoader(this: any) {
  const { actions, encryptionKey }: NextFlightActionEntryLoaderOptions =
    this.getOptions()

  const actionList = JSON.parse(actions) as [string, string[]][]
  const individualActions = actionList
    .map(([path, names]) => {
      return names.map((name) => {
        const id = generateActionId(encryptionKey, path, name)
        return [id, path, name] as [string, string, string]
      })
    })
    .flat()

  return `
${individualActions
  .map(([_, path]) => {
    // This import ensures that the module is always bundled even if there's no
    // explicit import in the codebase, to avoid the action being DCE'd.
    return `import(/* webpackMode: "eager" */ ${JSON.stringify(path)});`
  })
  .join('\n')}

${individualActions
  .map(([id, path, name]) => {
    // Re-export the same functions from the original module path as action IDs.
    return `export { ${name} as "${id}" } from ${JSON.stringify(path)}`
  })
  .join('\n')}
`
}

export default nextFlightActionEntryLoader
