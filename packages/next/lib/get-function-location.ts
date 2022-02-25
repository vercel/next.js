let id = 0

export async function getFunctionLocation(fn: any): Promise<{
  filename: string
  line: number
  column: number
}> {
  // use require to lazy load inspector
  const { Session } = require('inspector') as typeof import('inspector')
  const { promisify } = require('util')

  id += 1
  const session = new Session()
  session.post = promisify(session.post) as any
  const globalPath = `__nextFunction_${id}`
  ;(global as any)[globalPath] = fn

  try {
    const scripts: any = {}

    session.connect()
    session.on('Debugger.scriptParsed', (result) => {
      scripts[result.params.scriptId] = result
    })
    await session.post('Debugger.enable')
    const evalResult: any = await session.post('Runtime.evaluate', {
      expression: `global.${globalPath}`,
      objectGroup: globalPath,
    })
    const properties: any = await session.post('Runtime.getProperties', {
      objectId: evalResult.result.objectId,
    })
    let location = properties.internalProperties.find(
      (prop: any) => prop.name === '[[FunctionLocation]]'
    )
    let scriptForNode = scripts[location.value.value.scriptId]
    let filename = scriptForNode.params.url

    return {
      filename,
      line: location.value.value.lineNumber + 1,
      column: location.value.value.columnNumber + 1,
    }
  } finally {
    session.disconnect()
    delete (global as any)[globalPath]
  }
}
