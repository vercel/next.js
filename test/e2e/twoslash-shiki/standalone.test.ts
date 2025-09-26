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
  describe('output: standalone with shiki', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      dependencies: {
        shiki: '3.13.0',
        '@shikijs/twoslash': '3.13.0',
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
        const result = JSON.parse(body)
        expect(result).toMatchInlineSnapshot(`
         "<pre class="shiki vitesse-dark twoslash lsp" style="background-color:#121212;color:#dbd7caee" tabindex="0"><code><span class="line"></span>
         <span class="line"><span style="color:#CB7676">type</span><span style="color:#5DA994"> </span><span style="color:#5DA994"><span class="twoslash-hover"><span class="twoslash-popup-container"><code class="twoslash-popup-code"><span style="color:#CB7676">type</span><span style="color:#5DA994"> X</span><span style="color:#666666"> =</span><span style="color:#5DA994"> Promise</span><span style="color:#666666">&#x3C;</span><span style="color:#5DA994">number</span><span style="color:#666666">></span></code></span>X</span></span><span style="color:#666666"> =</span><span style="color:#5DA994"> </span><span style="color:#5DA994"><span class="twoslash-hover"><span class="twoslash-popup-container"><code class="twoslash-popup-code"><span style="color:#CB7676">interface</span><span style="color:#5DA994"> Promise</span><span style="color:#666666">&#x3C;</span><span style="color:#5DA994">T</span><span style="color:#666666">></span></code><div class="twoslash-popup-docs">Represents the completion of an asynchronous operation</div></span>Promise</span></span><span style="color:#666666">&#x3C;</span><span style="color:#5DA994">number</span><span style="color:#666666">></span></span>
         <span class="line"></span></code></pre>"
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
