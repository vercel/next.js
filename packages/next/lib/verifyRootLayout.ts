import path from 'path'
import { promises as fs } from 'fs'
import chalk from 'next/dist/compiled/chalk'
import * as Log from '../build/output/log'
import { APP_DIR_ALIAS } from './constants'

const globOrig =
  require('next/dist/compiled/glob') as typeof import('next/dist/compiled/glob')
const glob = (cwd: string, pattern: string): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    globOrig(pattern, { cwd }, (err, files) => {
      if (err) {
        return reject(err)
      }
      resolve(files)
    })
  })
}

function getRootLayout(isTs: boolean) {
  if (isTs) {
    return `export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <head />
      <body>{children}</body>
    </html>
  )
}
`
  }

  return `export default function RootLayout({ children }) {
  return (
    <html>
      <head />
      <body>{children}</body>
    </html>
  )
}
`
}

function getHead() {
  return `export default function Head() {
  return (
    <>
      <title></title>
      <meta content="width=device-width, initial-scale=1" name="viewport" />
      <link rel="icon" href="/favicon.ico" />
    </>
  )
}
`
}

export async function verifyRootLayout({
  dir,
  appDir,
  tsconfigPath,
  pagePath,
  pageExtensions,
}: {
  dir: string
  appDir: string
  tsconfigPath: string
  pagePath: string
  pageExtensions: string[]
}) {
  try {
    const layoutFiles = await glob(
      appDir,
      `**/layout.{${pageExtensions.join(',')}}`
    )
    const normalizedPagePath = pagePath.replace(`${APP_DIR_ALIAS}/`, '')
    const pagePathSegments = normalizedPagePath.split('/')

    // Find an available dir to place the layout file in, the layout file can't affect any other layout.
    // Place the layout as close to app/ as possible.
    let availableDir: string | undefined

    if (layoutFiles.length === 0) {
      // If there's no other layout file we can place the layout file in the app dir.
      // However, if the page is within a route group directly under app (e.g. app/(routegroup)/page.js)
      // prefer creating the root layout in that route group.
      const firstSegmentValue = pagePathSegments[0]
      availableDir = firstSegmentValue.startsWith('(') ? firstSegmentValue : ''
    } else {
      pagePathSegments.pop() // remove the page from segments

      let currentSegments: string[] = []
      for (const segment of pagePathSegments) {
        currentSegments.push(segment)
        // Find the dir closest to app/ where a layout can be created without affecting other layouts.
        if (
          !layoutFiles.some((file) =>
            file.startsWith(currentSegments.join('/'))
          )
        ) {
          availableDir = currentSegments.join('/')
          break
        }
      }
    }

    if (typeof availableDir === 'string') {
      const resolvedTsConfigPath = path.join(dir, tsconfigPath)
      const hasTsConfig = await fs.access(resolvedTsConfigPath).then(
        () => true,
        () => false
      )

      const rootLayoutPath = path.join(
        appDir,
        availableDir,
        `layout.${hasTsConfig ? 'tsx' : 'js'}`
      )
      await fs.writeFile(rootLayoutPath, getRootLayout(hasTsConfig))
      const headPath = path.join(
        appDir,
        availableDir,
        `head.${hasTsConfig ? 'tsx' : 'js'}`
      )
      const hasHead = await fs.access(headPath).then(
        () => true,
        () => false
      )

      if (!hasHead) {
        await fs.writeFile(headPath, getHead())
      }

      console.log(
        chalk.green(
          `\nYour page ${chalk.bold(
            `app/${normalizedPagePath}`
          )} did not have a root layout. We created ${chalk.bold(
            `app${rootLayoutPath.replace(appDir, '')}`
          )}${
            !hasHead
              ? ` and ${chalk.bold(`app${headPath.replace(appDir, '')}`)}`
              : ''
          } for you.`
        ) + '\n'
      )

      // Created root layout
      return true
    }
  } catch (error) {
    Log.error('Failed to create root layout', error)
  }

  // Didn't create root layout
  return false
}
