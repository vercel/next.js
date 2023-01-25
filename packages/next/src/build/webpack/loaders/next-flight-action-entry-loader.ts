export type NextFlightActionEntryLoaderOptions = {
  actionPath: string
  actionName: string
}

function nextFlightActionEntryLoader(this: any) {
  const { actionPath, actionName }: NextFlightActionEntryLoaderOptions =
    this.getOptions()

  return `
import { ${actionName} } from ${JSON.stringify(actionPath)}

export default async function endpoint(req, res) {
  try {
    const result = await ${actionName}()
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.body(JSON.stringify(result))
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'text/plain')
    res.body(err.message)
  }
  res.send()
}`
}

export default nextFlightActionEntryLoader
