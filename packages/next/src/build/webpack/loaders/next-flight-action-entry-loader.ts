import type { webpack } from 'next/dist/compiled/webpack/webpack'

export type NextFlightActionEntryLoaderOptions = {
  actions: string
}

export type FlightActionEntryLoaderActions = [
  path: string,
  actions: [id: string, name: string][],
][]

function nextFlightActionEntryLoader(
  this: webpack.LoaderContext<NextFlightActionEntryLoaderOptions>
) {
  const { actions }: NextFlightActionEntryLoaderOptions = this.getOptions()

  const actionList = JSON.parse(actions) as FlightActionEntryLoaderActions
  const individualActions = actionList
    .map(([path, actionsFromModule]) => {
      return actionsFromModule.map(([id, name]) => {
        return [id, path, name] as const
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
