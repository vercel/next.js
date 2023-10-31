import { createNextDescribe } from 'e2e-utils'
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
  createNextDescribe(
    'output: standalone with getStaticProps',
    {
      files: __dirname,
      skipStart: true,
      dependencies: {
        swr: 'latest',
      },
    },
    ({ next }) => {
      beforeAll(async () => {
        await next.patchFile(
          'next.config.js',
          (await next.readFile('next.config.js')).replace('// output', 'output')
        )

        await next.patchFile(
          'pages/gsp.js',
          `
          import useSWR from 'swr'

          console.log(useSWR)
          
          export default function Home() {
            return <h1>Hello</h1>
          }
          
          export async function getStaticProps() {
            return {
              props: {
                foo: "bar",
              },
            };
          }
        `
        )

        await next.start()
      })

      it('should work correctly with output standalone', async () => {
        const tmpFolder = path.join(
          os.tmpdir(),
          'next-standalone-' + Date.now()
        )
        await fs.move(path.join(next.testDir, '.next/standalone'), tmpFolder)
        let server: any

        try {
          const testServer = path.join(tmpFolder, 'server.js')
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
              cwd: tmpFolder,
            }
          )

          const res = await fetchViaHTTP(appPort, '/gsp')
          expect(res.status).toBe(200)
        } finally {
          if (server) await killApp(server)
          await fs.remove(tmpFolder)
        }
      })
    }
  )
}
