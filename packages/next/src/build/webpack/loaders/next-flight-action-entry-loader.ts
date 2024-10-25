export type NextFlightActionEntryLoaderOptions = {
  actions: string
}

function nextFlightActionEntryLoader(this: any) {
  const { actions }: NextFlightActionEntryLoaderOptions = this.getOptions()

  const actionList = JSON.parse(actions) as [
    string,
    [id: string, name: string][],
  ][]
  const individualActions = actionList
    .map(([path, actionsFromModule]) => {
      return actionsFromModule.map(([id, name]) => {
        return [id, path, name]
      })
    })
    .flat()

  return `
${individualActions
  .map(([id, path, name]) => {
    // Re-export the same functions from the original module path as action IDs.
    return `export { ${name} as "${id}" } from ${JSON.stringify(path)}`
  })
  .join('\n')}
`
}

export default nextFlightActionEntryLoader
