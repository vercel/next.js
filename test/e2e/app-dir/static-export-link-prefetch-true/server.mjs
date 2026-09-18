import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import handler from 'serve-handler'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'out')

export const server = createServer((request, response) =>
  handler(request, response, { public: OUT_DIR })
)
