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
    return `import(/* webpackMode: "eager" */ ${JSON.stringify(path)});`
  })
  .join('\n')}

${individualActions
  .map(([id, path, name]) => {
    return `export { ${name} as "${id}" } from ${JSON.stringify(path)}`
  })
  .join('\n')}
`
}

export default nextFlightActionEntryLoader
