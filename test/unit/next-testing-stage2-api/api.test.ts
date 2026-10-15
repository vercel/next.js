import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'

it('runs stage two API conformance against built Next in a fresh realm', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'cases.ts'),
  ]).catch((error) => {
    throw new Error([error.message, error.stdout, error.stderr].join('\n'))
  })
  expect(stdout).toContain('# tests 19')
  expect(stdout).toContain('# fail 0')
}, 30000)

it('stages browser snapshot requests without granting writes or asynchronous source mapping', async () => {
  const { VitestSnapshotEnvironment, installBrowserSnapshotBridge } =
    await import('next/dist/experimental/testing/client/snapshot-environment')
  const { stageSnapshotUpdates } = await import(
    'next/dist/experimental/testing/assertions/snapshot-common'
  )
  const requests: unknown[] = []
  const environment = new VitestSnapshotEnvironment()
  await expect(environment.resolvePath('/test.mjs')).rejects.toThrow(
    'installed parent bridge'
  )
  let mapped: unknown = { file: '/source.mjs', line: 7, column: 2 }
  let content: string | null = null
  installBrowserSnapshotBridge({
    async request(method, args) {
      requests.push({ method, args })
      if (method === 'readSnapshotFile') return content
      return method === 'resolveRawPath' ? args[1] : '/test.snap'
    },
    mapLocation() {
      return mapped as { file: string; line: number; column: number }
    },
  })
  expect(environment.getHeader()).toBe(
    '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html'
  )
  expect(await environment.resolvePath('/test.mjs')).toBe('/test.snap')
  expect(await environment.resolveRawPath('/test.mjs', '/raw.txt')).toBe(
    '/raw.txt'
  )
  const staged = stageSnapshotUpdates(environment, true)
  expect(await staged.environment.readSnapshotFile('/test.snap')).toBeNull()
  content = 'a later parent read'
  await staged.environment.readSnapshotFile('/test.snap')
  await staged.environment.saveSnapshotFile('/test.snap', 'new bytes')
  expect(staged.take()).toEqual([
    { path: '/test.snap', content: 'new bytes', previousContent: null },
  ])
  expect(staged.take()).toEqual([])
  await expect(
    environment.saveSnapshotFile('/test.snap', 'bad')
  ).rejects.toThrow('staged parent publication')
  await expect(environment.removeSnapshotFile('/test.snap')).rejects.toThrow(
    'staged parent publication'
  )
  expect(
    environment.processStackTrace({
      file: '/output.js',
      line: 8,
      column: 9,
      method: 'test',
    })
  ).toEqual({ ...(mapped as object), method: 'test' })
  mapped = Promise.resolve({ file: '/source.mjs', line: 7, column: 2 })
  expect(() =>
    environment.processStackTrace({
      file: '/output.js',
      line: 8,
      column: 9,
      method: 'test',
    })
  ).toThrow('synchronous source frame')
  expect(() =>
    installBrowserSnapshotBridge({
      request: async () => null,
      mapLocation: (f) => f,
    })
  ).toThrow('already installed')
  expect(requests).toEqual([
    { method: 'resolvePath', args: ['/test.mjs'] },
    { method: 'resolveRawPath', args: ['/test.mjs', '/raw.txt'] },
    { method: 'readSnapshotFile', args: ['/test.snap'] },
    { method: 'readSnapshotFile', args: ['/test.snap'] },
  ])
})
