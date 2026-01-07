import { nextTestSetup } from 'e2e-utils'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import {
  findPort,
  initNextServerScript,
  killApp,
  fetchViaHTTP,
} from 'next-test-utils'

if (!(globalThis as any).isNextStart) {
  it('should skip for non-next start', () => {})
} else {
  describe('output: standalone with twoslash', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      dependencies: {
        twoslash: '0.3.4',
      },
      skipStart: true,
    })

    if (skipped) {
      return
    }

    let server: any
    let appPort: number
    let tmpFolder: string

    beforeAll(async () => {
      await next.patchFile(
        'next.config.js',
        (await next.readFile('next.config.js')).replace('// output', 'output')
      )
      await next.build()

      tmpFolder = path.join(os.tmpdir(), 'next-standalone-' + Date.now())
      await fs.mkdirp(tmpFolder)
      const distFolder = path.join(tmpFolder, 'test')
      await fs.move(path.join(next.testDir, '.next/standalone'), distFolder)
      const testServer = path.join(distFolder, 'server.js')
      appPort = await findPort()
      server = await initNextServerScript(
        testServer,
        /- Local:/,
        {
          ...process.env,
          PORT: appPort.toString(),
        },
        undefined,
        {
          cwd: distFolder,
        }
      )
    })

    afterAll(async () => {
      if (server) await killApp(server)
      if (!process.env.NEXT_TEST_SKIP_CLEANUP) {
        await fs.remove(tmpFolder)
      }
    })

    it.each(['default', 'esnext'])(
      'should annotate twoslash types %s',
      async (mode) => {
        const { code, nodes, error } = await (
          await fetchViaHTTP(appPort, `/?${mode}`)
        ).json()
        expect({ code, nodes, error }).toMatchInlineSnapshot(`
           {
             "code": "type X = Promise<number>;
           'hello'.toUpperCase()",
             "error": undefined,
             "nodes": [
               {
                 "character": 5,
                 "length": 1,
                 "line": 0,
                 "start": 5,
                 "target": "X",
                 "text": "type X = Promise<number>",
                 "type": "hover",
               },
               {
                 "character": 9,
                 "docs": "Represents the completion of an asynchronous operation",
                 "length": 7,
                 "line": 0,
                 "start": 9,
                 "target": "Promise",
                 "text": "interface Promise<T>",
                 "type": "hover",
               },
               {
                 "character": 8,
                 "docs": "Converts all the alphabetic characters in a string to uppercase.",
                 "length": 11,
                 "line": 1,
                 "start": 34,
                 "target": "toUpperCase",
                 "text": "(method) String.toUpperCase(): string",
                 "type": "hover",
               },
             ],
           }
          `)
      }
    )
  })
}
