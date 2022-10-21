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
      <head></head>
      <body>{children}</body>
    </html>
  )
}
`
  }

  return `export default function RootLayout({ children }) {
  return (
    <html>
      <head></head>
      <body>{children}</body>
    </html>
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
    const hasLayout = layoutFiles.length !== 0

    const normalizedPagePath = pagePath.replace(`${APP_DIR_ALIAS}/`, '')
    const firstSegmentValue = normalizedPagePath.split('/')[0]
    const pageRouteGroup = firstSegmentValue.startsWith('(')
      ? firstSegmentValue
      : undefined

    if (pageRouteGroup || !hasLayout) {
      const resolvedTsConfigPath = path.join(dir, tsconfigPath)
      const hasTsConfig = await fs.access(resolvedTsConfigPath).then(
        () => true,
        () => false
      )

      const rootLayoutPath = path.join(
        appDir,
        // If the page is within a route group directly under app (e.g. app/(routegroup)/page.js)
        // prefer creating the root layout in that route group. Otherwise create the root layout in the app root.
        pageRouteGroup ? pageRouteGroup : '',
        `layout.${hasTsConfig ? 'tsx' : 'js'}`
      )
      await fs.writeFile(rootLayoutPath, getRootLayout(hasTsConfig))
      console.log(
        chalk.green(
          `\nYour page ${chalk.bold(
            `app/${normalizedPagePath}`
          )} did not have a root layout, we created ${chalk.bold(
            `app${rootLayoutPath.replace(appDir, '')}`
          )} for you.`
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
