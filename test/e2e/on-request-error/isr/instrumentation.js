import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'

const dir = path.dirname(new URL(import.meta.url).pathname)
const logPath = path.join(dir, 'output-log.json')

export async function register() {
  await fsp.writeFile(logPath, '{}', 'utf8')
}

// Since only Node.js runtime support ISR, we can just write the error state to a file here.
// `onRequestError` will only be bundled within the Node.js runtime.
export async function onRequestError(err, request, context) {
  const payload = {
    message: err.message,
    request,
    context,
  }

  const json = fs.existsSync(logPath)
    ? JSON.parse(await fsp.readFile(logPath, 'utf8'))
    : {}

  json[payload.message] = payload

  console.log(
    `[instrumentation] write-log:${payload.message} ${payload.context.revalidateReason}`
  )
  await fsp.writeFile(logPath, JSON.stringify(json, null, 2), 'utf8')
}
