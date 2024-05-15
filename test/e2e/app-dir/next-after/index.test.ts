/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import { sandbox } from '../../../lib/development-sandbox'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as Log from './utils/log'

describe('unstable_after()', () => {
  const logFileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logs-'))
  const logFile = path.join(logFileDir, 'logs.jsonl')

  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    env: {
      PERSISTENT_LOG_FILE: logFile,
    },
  })

  const getLogs = () => Log.readPersistentLog(logFile)
  beforeEach(() => Log.clearPersistentLog(logFile))

  if (isNextDev) {
    describe('invalid usages', () => {
      it('errors at compile time when used in a client module', async () => {
        const { session, cleanup } = await sandbox(
          next,
          new Map([
            [
              'app/invalid-in-client/page.js',
              (await next.readFile('app/invalid-in-client/page.js')).replace(
                `// 'use client'`,
                `'use client'`
              ),
            ],
          ]),
          '/invalid-in-client'
        )
        try {
          expect(await session.getRedboxSource(true)).toMatch(
            /You're importing a component that needs "?unstable_after"?\. That only works in a Server Component but one of its parents is marked with "use client", so it's a Client Component\./
          )
          expect(getLogs()).toHaveLength(0)
        } finally {
          await cleanup()
        }
      })

      describe('errors at compile time when used in pages dir', () => {
        it.each([
          {
            path: '/pages-dir/invalid-in-gssp',
            file: 'pages-dir/invalid-in-gssp.js',
          },
          {
            path: '/pages-dir/123/invalid-in-gsp',
            file: 'pages-dir/[id]/invalid-in-gsp.js',
          },
          {
            path: '/pages-dir/invalid-in-page',
            file: 'pages-dir/invalid-in-page.js',
          },
        ])('$file', async ({ path, file }) => {
          const { session, cleanup } = await sandbox(
            next,
            new Map([[`pages/${file}`, await next.readFile(`_pages/${file}`)]]),
            path
          )

          try {
            expect(await session.getRedboxSource(true)).toMatch(
              /You're importing a component that needs "?unstable_after"?\. That only works in a Server Component which is not supported in the pages\/ directory\./
            )
            expect(getLogs()).toHaveLength(0)
          } finally {
            await cleanup()
          }
        })
      })
    })
  }
})
