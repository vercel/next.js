import { generateActionId } from './utils'

export type NextFlightActionEntryLoaderOptions = {
  actions: string
}

function nextFlightActionEntryLoader(this: any) {
  const { actions }: NextFlightActionEntryLoaderOptions = this.getOptions()

  const actionList = JSON.parse(actions) as [string, string[]][]
  const individualActions = actionList
    .map(([path, names]) => {
      return names.map((name) => {
        const id = generateActionId(path, name)
        return [id, path, name] as [string, string, string]
      })
    })
    .flat()

  return `
const actions = {
${individualActions
  .map(([id, path, name]) => {
    return `'${id}': () => import(/* webpackMode: "eager" */ ${JSON.stringify(
      path
    )}).then(mod => mod[${JSON.stringify(name)}]),`
  })
  .join('\n')}
}

async function endpoint(id, ...args) {
  const action = await actions[id]()
  return action.apply(null, args)
}

// Using CJS to avoid this to be tree-shaken away due to unused exports.
module.exports = {
${individualActions
  .map(([id]) => {
    return `  '${id}': endpoint.bind(null, '${id}'),`
  })
  .join('\n')}
}
`
}

export default nextFlightActionEntryLoader
