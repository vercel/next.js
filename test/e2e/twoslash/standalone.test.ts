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

    beforeAll(async () => {
      await next.patchFile(
        'next.config.ts',
        (await next.readFile('next.config.ts')).replace('// output', 'output')
      )
      await next.start()
    })

    it('should annotate twoslash types', async () => {
      const tmpFolder = path.join(os.tmpdir(), 'next-standalone-' + Date.now())
      await fs.mkdirp(tmpFolder)
      const distFolder = path.join(tmpFolder, 'test')
      await fs.move(path.join(next.testDir, '.next/standalone'), distFolder)
      let server: any
      try {
        const testServer = path.join(distFolder, 'server.js')
        const appPort = await findPort()
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

        let body = await (await fetchViaHTTP(appPort, '/')).text()
        console.log(body)
        const { code, nodes } = JSON.parse(body)
        expect({ code, nodes }).toMatchInlineSnapshot(`
         {
           "code": "'hello'.toUpperCase()",
           "nodes": [
             {
               "character": 8,
               "docs": "Converts all the alphabetic characters in a string to uppercase.",
               "length": 11,
               "line": 0,
               "start": 8,
               "target": "toUpperCase",
               "text": "(method) String.toUpperCase(): string",
               "type": "hover",
             },
           ],
         }
        `)
      } finally {
        if (server) await killApp(server)
        if (!process.env.NEXT_TEST_SKIP_CLEANUP) {
          await fs.remove(tmpFolder)
        }
      }
    })
  })
}
