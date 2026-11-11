import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'

it.each(['node', 'jsdom'] as const)(
  'preserves actual %s EventTarget/signal brands and native listener ownership',
  async (realm) => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [join(__dirname, 'listener-realms.cjs'), realm],
      { timeout: 10000, maxBuffer: 1024 * 1024 }
    )
    expect(JSON.parse(stdout)).toEqual({
      realm,
      allNativeListenerControlsPassed: true,
      originalRealmAndErrorBrandsRetained: true,
    })
  }
)
