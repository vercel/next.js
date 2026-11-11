import { execFile } from 'child_process'
import { readFile } from 'fs/promises'
import { dirname } from 'path'
import { z } from 'next/dist/compiled/zod'
import { LRUCache } from '../../server/lib/lru-cache'
import { MiddlewareConfigInputSchema } from '../segment-config/middleware/middleware-config'

const routeSchema = z
  .object({
    maxDuration: z.number().int().positive().optional(),
    preferredRegion: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict()
const proxySchema = routeSchema
  .extend({
    matcher: MiddlewareConfigInputSchema.shape.matcher,
  })
  .strict()

type GoConfig = z.infer<typeof proxySchema>
const cache = new LRUCache<Promise<GoConfig>>(200)

// Only the framework's AST reader is executed. Application imports and init
// functions are never loaded to discover deployment metadata.
export async function readGoConfig(
  filename: string,
  kind: 'route' | 'proxy'
): Promise<GoConfig> {
  const source = await readFile(filename, 'utf8')
  if (!/\bConfig\b/.test(source)) return {}
  const go = process.env.TURBOPACK_GO || 'go'
  const key = JSON.stringify([go, filename, kind, source])
  const existing = cache.get(key)
  if (existing) return existing
  const result = new Promise<GoConfig>((resolve, reject) => {
    const tool = require.resolve('next/go/internal/configparser/main.go')
    const child = execFile(
      go,
      ['run', tool],
      {
        cwd: dirname(tool),
        env: {
          ...process.env,
          GO111MODULE: 'off',
          GOWORK: 'off',
          // Deployment targets may differ from the host running this AST reader.
          GOOS: process.platform === 'win32' ? 'windows' : process.platform,
          GOARCH: process.arch === 'x64' ? 'amd64' : process.arch,
        },
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `Invalid static Go config in ${filename}:\n${stderr.trim() || error.message}`
            )
          )
          return
        }
        try {
          resolve(
            (kind === 'proxy' ? proxySchema : routeSchema).parse(
              JSON.parse(stdout)
            )
          )
        } catch (parseError) {
          reject(
            new Error(
              `Invalid static Go config in ${filename}: ${parseError instanceof Error ? parseError.message : String(parseError)}`
            )
          )
        }
      }
    )
    child.stdin?.on('error', reject)
    child.stdin?.end(JSON.stringify({ filename, source, kind }))
  })
  cache.set(key, result)
  // Failed probes must not cache transient toolchain/startup errors.
  result.catch(() => {
    if (cache.get(key) === result) cache.remove(key)
  })
  return result
}
