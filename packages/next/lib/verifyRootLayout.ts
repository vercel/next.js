import path from 'path'
import { promises as fs } from 'fs'
import chalk from 'next/dist/compiled/chalk'
import * as Log from '../build/output/log'

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
}: {
  dir: string
  appDir: string
  tsconfigPath: string
}) {
  try {
    // Only create root layout if no other layout exists
    const layoutFiles = await glob(dir, 'app/**/layout.{js,jsx,ts,tsx}')
    const hasLayout = layoutFiles.length !== 0
    if (!hasLayout) {
      const resolvedTsConfigPath = path.join(dir, tsconfigPath)
      const hasTsConfig = await fs.access(resolvedTsConfigPath).then(
        () => true,
        () => false
      )

      const rootLayoutPath = path.join(
        appDir,
        `layout.${hasTsConfig ? 'tsx' : 'js'}`
      )
      await fs.writeFile(rootLayoutPath, getRootLayout(hasTsConfig))
      console.log(
        chalk.green(
          `${chalk.bold(
            'appDir'
          )} is enabled but you're missing a root layout, we created ${chalk.bold(
            `app/layout.${hasTsConfig ? 'tsx' : 'js'}`
          )} for you.`
        ) + '\n'
      )
    }
  } catch (error) {
    Log.error('Failed to create root layout', error)
  }
}
