import { install } from '../helpers/install'
import { makeDir } from '../helpers/make-dir'

import cpy from 'cpy'
import { async as glob } from 'fast-glob'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { cyan, bold } from 'picocolors'
import { Sema } from 'async-sema'

import { GetTemplateFileArgs, InstallTemplateArgs } from './types'

/**
 * Get the file path for a given file in a template, e.g. "next.config.js".
 */
export const getTemplateFile = ({
  template,
  mode,
  file,
}: GetTemplateFileArgs): string => {
  return path.join(__dirname, template, mode, file)
}

export const SRC_DIR_NAMES = ['app', 'pages', 'styles']

/**
 * Install a Next.js internal template to a given `root` directory.
 */
export const installTemplate = async ({
  appName,
  root,
  packageManager,
  isOnline,
  template,
  mode,
  tailwind,
  eslint,
  srcDir,
  importAlias,
}: InstallTemplateArgs) => {
  console.log(bold(`Using ${packageManager}.`))

  /**
   * Copy the template files to the target directory.
   */
  console.log('\nInitializing project with template:', template, '\n')
  const templatePath = path.join(__dirname, template, mode)
  const copySource = ['**']
  if (!eslint) copySource.push('!eslintrc.json')
  if (!tailwind) copySource.push('!tailwind.config.js', '!postcss.config.js')

  await cpy(copySource, root, {
    parents: true,
    cwd: templatePath,
    rename: (name) => {
      switch (name) {
        case 'gitignore':
        case 'eslintrc.json': {
          return '.'.concat(name)
        }
        // README.md is ignored by webpack-asset-relocator-loader used by ncc:
        // https://github.com/vercel/webpack-asset-relocator-loader/blob/e9308683d47ff507253e37c9bcbb99474603192b/src/asset-relocator.js#L227
        case 'README-template.md': {
          return 'README.md'
        }
        default: {
          return name
        }
      }
    },
  })

  const tsconfigFile = path.join(
    root,
    mode === 'js' ? 'jsconfig.json' : 'tsconfig.json'
  )
  await fs.promises.writeFile(
    tsconfigFile,
    (await fs.promises.readFile(tsconfigFile, 'utf8'))
      .replace(
        `"@/*": ["./*"]`,
        srcDir ? `"@/*": ["./src/*"]` : `"@/*": ["./*"]`
      )
      .replace(`"@/*":`, `"${importAlias}":`)
  )

  // update import alias in any files if not using the default
  if (importAlias !== '@/*') {
    const files = await glob<string>('**/*', {
      cwd: root,
      dot: true,
      stats: false,
    })
    const writeSema = new Sema(8, { capacity: files.length })
    await Promise.all(
      files.map(async (file) => {
        // We don't want to modify compiler options in [ts/js]config.json
        if (file === 'tsconfig.json' || file === 'jsconfig.json') return
        await writeSema.acquire()
        const filePath = path.join(root, file)
        if ((await fs.promises.stat(filePath)).isFile()) {
          await fs.promises.writeFile(
            filePath,
            (
              await fs.promises.readFile(filePath, 'utf8')
            ).replace(`@/`, `${importAlias.replace(/\*/g, '')}`)
          )
        }
        await writeSema.release()
      })
    )
  }

  if (srcDir) {
    await makeDir(path.join(root, 'src'))
    await Promise.all(
      SRC_DIR_NAMES.map(async (file) => {
        await fs.promises
          .rename(path.join(root, file), path.join(root, 'src', file))
          .catch((err) => {
            if (err.code !== 'ENOENT') {
              throw err
            }
          })
      })
    )

    const isAppTemplate = template.startsWith('app')

    // Change the `Get started by editing pages/index` / `app/page` to include `src`
    const indexPageFile = path.join(
      'src',
      isAppTemplate ? 'app' : 'pages',
      `${isAppTemplate ? 'page' : 'index'}.${mode === 'ts' ? 'tsx' : 'js'}`
    )

    await fs.promises.writeFile(
      indexPageFile,
      (
        await fs.promises.readFile(indexPageFile, 'utf8')
      ).replace(
        isAppTemplate ? 'app/page' : 'pages/index',
        isAppTemplate ? 'src/app/page' : 'src/pages/index'
      )
    )

    if (tailwind) {
      const tailwindConfigFile = path.join(root, 'tailwind.config.js')
      await fs.promises.writeFile(
        tailwindConfigFile,
        (
          await fs.promises.readFile(tailwindConfigFile, 'utf8')
        ).replace(
          /\.\/(\w+)\/\*\*\/\*\.\{js,ts,jsx,tsx,mdx\}/g,
          './src/$1/**/*.{js,ts,jsx,tsx,mdx}'
        )
      )
    }
  }

  /**
   * Create a package.json for the new project.
   */
  const packageJson = {
    name: appName,
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      lint: 'next lint',
    },
  }

  /**
   * Write it to disk.
   */
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(packageJson, null, 2) + os.EOL
  )

  /**
   * These flags will be passed to `install()`, which calls the package manager
   * install process.
   */
  const installFlags = { packageManager, isOnline }

  /**
   * Default dependencies.
   */
  const dependencies = [
    'react',
    'react-dom',
    `next${
      process.env.NEXT_PRIVATE_TEST_VERSION
        ? `@${process.env.NEXT_PRIVATE_TEST_VERSION}`
        : ''
    }`,
  ]

  /**
   * TypeScript projects will have type definitions and other devDependencies.
   */
  if (mode === 'ts') {
    dependencies.push(
      'typescript',
      '@types/react',
      '@types/node',
      '@types/react-dom'
    )
  }

  /**
   * Add Tailwind CSS dependencies.
   */
  if (tailwind) {
    dependencies.push('tailwindcss', 'postcss', 'autoprefixer')
  }

  /**
   * Default eslint dependencies.
   */
  if (eslint) {
    dependencies.push('eslint', 'eslint-config-next')
  }
  /**
   * Install package.json dependencies if they exist.
   */
  if (dependencies.length) {
    console.log()
    console.log('Installing dependencies:')
    for (const dependency of dependencies) {
      console.log(`- ${cyan(dependency)}`)
    }
    console.log()

    await install(root, dependencies, installFlags)
  }
}

export * from './types'
