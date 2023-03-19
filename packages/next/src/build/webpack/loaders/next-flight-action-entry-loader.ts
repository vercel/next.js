import { generateActionId } from './utils'

export type NextFlightActionEntryLoaderOptions = {
  actions: string
}

function nextFlightActionEntryLoader(this: any) {
  const { actions }: NextFlightActionEntryLoaderOptions = this.getOptions()

  const actionList = JSON.parse(actions) as [string, string[]][]

  return `
const actions = {
${actionList
  .map(([path, names]) => {
    return names
      .map(
        (name) =>
          `  '${generateActionId(
            path,
            name
          )}': () => import(/* webpackMode: "eager" */ ${JSON.stringify(
            path
          )}).then(mod => mod[${JSON.stringify(name)}]),`
      )
      .join('\n')
  })
  .join('\n')}
}

async function endpoint(id, args) {
  const action = await actions[id]()
  
  if (action.$$with_bound === false) {
    return action.apply(null, args)
  }

  return action.call(null, args)
}

// Using "export default" will cause this to be tree-shaken away due to unused exports.
module.exports = endpoint
`
}

export default nextFlightActionEntryLoader
