import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '../..')
const logPath = path.join(dir, 'output-log.json')

export async function POST(req) {
  let payloadString = ''
  const decoder = new TextDecoder()
  const reader = req.clone().body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    payloadString += decoder.decode(value)
  }

  const payload = JSON.parse(payloadString)

  const json = fs.existsSync(logPath)
    ? JSON.parse(await fsp.readFile(logPath, 'utf8'))
    : {}

  if (!json[payload.message]) {
    json[payload.message] = {
      payload,
      count: 1,
    }
  } else {
    json[payload.message].count++
  }

  await fsp.writeFile(logPath, JSON.stringify(json, null, 2), 'utf8')

  console.log(`[instrumentation] write-log:${payload.message}`)
  return new Response(null, { status: 204 })
}
