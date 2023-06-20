import * as pty from 'node-pty'
import fs from 'fs-extra'
import path from 'path'
import stripAnsi from 'strip-ansi'

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
  {
    filename: 'next.config.js',
    content: `
    module.exports = {
      experimental: {
        appDir: true
      }
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

it.each([
  { name: 'app dir', files: appDirFiles },
  {
    name: 'app dir (compile workers)',
    files: [
      ...appDirFiles,
      {
        filename: 'next.config.js',
        content: `
        module.exports = {
          experimental: {
            appDir: true,
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
  const appDir = path.join(__dirname, 'app')
  await fs.remove(appDir)

  try {
    for (const file of files) {
      await fs.ensureDir(path.dirname(path.join(appDir, file.filename)))
      await fs.writeFile(path.join(appDir, file.filename), file.content)
    }

    const nextBin = require.resolve('next/dist/bin/next')

    const output = []
    const ptyProcess = pty.spawn(process.execPath, [nextBin, 'build'], {
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
  } finally {
    await fs.remove(appDir)
  }
})
