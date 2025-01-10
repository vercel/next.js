import path from 'path'
import fs from 'fs-extra'
import stripAnsi from 'strip-ansi'
import resolveFrom from 'resolve-from'
import { NextInstance, createNext } from 'e2e-utils'

type File = {
  filename: string
  content: string
}

const appDirFiles: File[] = [
  {
    filename: 'app/page.js',
    content: `
    export default function Page() {
      return <p>hello world</p>
    }
  `,
  },
  {
    filename: 'app/layout.js',
    content: `
    export default function Layout({ children }) {
      return (
        <html>
          <head />
          <body>{children}</body>
        </html>
      )
    }
  `,
  },
]
const pagesFiles: File[] = [
  {
    filename: 'pages/another.js',
    content: `
    export default function Page() {
      return (
        <p>another page</p>
      )
    }
  `,
  },
]

let next: NextInstance

describe('build-spinners', () => {
  beforeAll(async () => {
    next = await createNext({
      skipStart: true,
      files: {},
      dependencies: {
        'node-pty': '0.10.1',
      },
    })
  })

  afterAll(() => next.destroy())

  beforeEach(async () => {
    await fs.remove(path.join(next.testDir, 'pages'))
    await fs.remove(path.join(next.testDir, 'app'))
  })

  it.each([
    { name: 'app dir - basic', files: appDirFiles },
    {
      name: 'app dir - (compile workers)',
      files: [
        ...appDirFiles,
        {
          filename: 'next.config.js',
          content: `
        module.exports = {
          experimental: {
            webpackBuildWorker: true,
          }
        }
      `,
        },
      ],
    },
    {
      name: 'page dir',
      files: [
        ...pagesFiles,
        {
          filename: 'next.config.js',
          content: `
        module.exports = {
          experimental: {
            webpackBuildWorker: true,
          }
        }
      `,
        },
      ],
    },
    { name: 'page dir (compile workers)', files: pagesFiles },
    { name: 'app and pages', files: [...appDirFiles, ...pagesFiles] },
  ])('should handle build spinners correctly $name', async ({ files }) => {
    for (const { filename, content } of files) {
      await next.patchFile(filename, content)
    }

    const appDir = next.testDir

    const ptyPath = resolveFrom(appDir, 'node-pty')
    const pty = require(ptyPath)
    const output = []
    const ptyProcess = pty.spawn('pnpm', ['next', 'build'], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: appDir,
      env: process.env,
    })

    ptyProcess.onData(function (data) {
      stripAnsi(data)
        .split('\n')
        .forEach((line) => output.push(line))
      process.stdout.write(data)
    })

    await new Promise<void>((resolve, reject) => {
      ptyProcess.onExit(({ exitCode, signal }) => {
        if (exitCode) {
          return reject(`failed with code ${exitCode}`)
        }
        resolve()
      })
    })

    let compiledIdx = -1
    let optimizedBuildIdx = -1
    let collectingPageDataIdx = -1
    let generatingStaticIdx = -1
    let finalizingOptimization = -1

    // order matters so we check output from end to start
    for (let i = output.length - 1; i--; i >= 0) {
      const line = output[i]

      if (compiledIdx === -1 && line.includes('Compiled successfully')) {
        compiledIdx = i
      }

      if (
        optimizedBuildIdx === -1 &&
        line.includes('Creating an optimized production build')
      ) {
        optimizedBuildIdx = i
      }

      if (
        collectingPageDataIdx === -1 &&
        line.includes('Collecting page data')
      ) {
        collectingPageDataIdx = i
      }

      if (
        generatingStaticIdx === -1 &&
        line.includes('Generating static pages')
      ) {
        generatingStaticIdx = i
      }

      if (
        finalizingOptimization === -1 &&
        line.includes('Finalizing page optimization')
      ) {
        finalizingOptimization = i
      }
    }

    expect(compiledIdx).not.toBe(-1)
    expect(optimizedBuildIdx).not.toBe(-1)
    expect(collectingPageDataIdx).not.toBe(-1)
    expect(generatingStaticIdx).not.toBe(-1)
    expect(finalizingOptimization).not.toBe(-1)

    expect(optimizedBuildIdx).toBeLessThan(compiledIdx)
    expect(compiledIdx).toBeLessThan(collectingPageDataIdx)
    expect(collectingPageDataIdx).toBeLessThan(generatingStaticIdx)
    expect(generatingStaticIdx).toBeLessThan(finalizingOptimization)
  })
})
