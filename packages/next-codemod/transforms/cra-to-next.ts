import fs from 'fs'
import path from 'path'
import execa from 'execa'
import globby from 'globby'
// import cheerio from 'cheerio'
import { install } from '../lib/install'
import runJscodeshift from '../lib/run-jscodeshift'
import { indexContext } from '../lib/cra-to-next/index-to-component'
import { globalCssImports } from '../lib/cra-to-next/global-css-transform'

// log error and exit without new stacktrace
function fatalMessage(...logs) {
  console.error(...logs)
  process.exit(1)
}

const craTransformsPath = path.join('../lib/cra-to-next')

const globalCssTransformPath = require.resolve(
  path.join(craTransformsPath, 'global-css-transform.js')
)
const indexTransformPath = require.resolve(
  path.join(craTransformsPath, 'index-to-component.js')
)

class CraTransform {
  private appDir: string
  private pagesDir: string
  private isDryRun: boolean
  private installClient: string
  private shouldLogInfo: boolean
  private packageJsonPath: string
  private shouldUseTypeScript: boolean
  private packageJsonData: { [key: string]: any }
  private jscodeShiftFlags: { [key: string]: boolean }

  constructor(files: string[], flags: { [key: string]: boolean }) {
    this.isDryRun = flags.dry
    this.jscodeShiftFlags = flags
    this.appDir = this.validateAppDir(files)
    this.packageJsonPath = path.join(this.appDir, 'package.json')
    this.packageJsonData = this.loadPackageJson()
    this.shouldLogInfo = flags.print || flags.dry
    this.pagesDir = this.getPagesDir()
    this.installClient = this.checkForYarn() ? 'yarn' : 'npm'
    this.shouldUseTypeScript =
      fs.existsSync(path.join(this.appDir, 'tsconfig.json')) ||
      globby.sync('src/**/*.{ts,tsx}', { cwd: this.appDir }).length > 0
  }

  public async transform() {
    console.log('Transforming CRA project at:', this.appDir)

    const indexPagePath = globby.sync(['index.{js,jsx,ts,tsx}'], {
      cwd: path.join(this.appDir, 'src'),
    })[0]

    // convert src/index.js to a react component to render
    // inside of Next.js instead of the custom render root
    const indexTransformRes = await runJscodeshift(
      indexTransformPath,
      { ...this.jscodeShiftFlags, silent: true, verbose: 0 },
      [path.join(this.appDir, 'src', indexPagePath)]
    )

    if (indexTransformRes.error > 0) {
      fatalMessage(
        `Error: failed to apply transforms for src/${indexPagePath}, please check for syntax errors to continue`
      )
    }

    if (indexContext.multipleRenderRoots) {
      fatalMessage(
        `Error: multiple render roots in src/${indexPagePath}, migrate additional render roots to use portals instead to continue.\n` +
          `See here for more info: https://reactjs.org/docs/portals.html`
      )
    }

    // comment out global style imports and collect them
    // so that we can add them to _app
    const globalCssRes = await runJscodeshift(
      globalCssTransformPath,
      { ...this.jscodeShiftFlags },
      [this.appDir]
    )

    if (globalCssRes.error > 0) {
      fatalMessage(
        `Error: failed to apply transforms for src/${indexPagePath}, please check for syntax errors to continue`
      )
    }

    if (!this.isDryRun) {
      await fs.promises.mkdir(path.join(this.appDir, this.pagesDir))
    }
    this.logCreate(this.pagesDir)

    await this.updatePackageJson()
    await this.createNextConfig()
    await this.updateGitIgnore()

    // only create .babelrc if {ReactComponent} svg import is used
    await this.createBabelrc()
    await this.createPages()
  }

  private checkForYarn() {
    try {
      const userAgent = process.env.npm_config_user_agent
      if (userAgent) {
        return Boolean(userAgent && userAgent.startsWith('yarn'))
      }
      execa.sync('yarnpkg', ['--version'], { stdio: 'ignore' })
      return true
    } catch (e) {
      console.log('error', e)
      return false
    }
  }

  private logCreate(...args: any[]) {
    if (this.shouldLogInfo) {
      console.log('Created:', ...args)
    }
  }

  private logModify(...args: any[]) {
    if (this.shouldLogInfo) {
      console.log('Modified:', ...args)
    }
  }

  private logInfo(...args: any[]) {
    if (this.shouldLogInfo) {
      console.log(...args)
    }
  }

  private async createPages() {
    // load public/index.html and add tags to _document
    // const htmlContent = await fs.promises.readFile(
    //   path.join(this.appDir, 'public/index.html'),
    //   'utf8'
    // )
    // const $ = cheerio.load(htmlContent)
    // note: title tag needs to be placed in _app not _document
    // const headTags = $('head').children()
    // const bodyTags = $('body').children()
    // create _app and move reportWebVitals function here
    // along with all global CSS
    // we can use jscodeshift with runInBand set to collect all global
    // CSS and comment it out migrating it into _app
    const pageExt = this.shouldUseTypeScript ? '.tsx' : 'js'
    const appPage = path.join(this.pagesDir, `_app.${pageExt}`)
    // const documentPage = path.join(this.pagesDir, '_document.js')
    const catchAllPage = path.join(this.pagesDir, `[[...slug]].${pageExt}`)

    if (!this.isDryRun) {
      await fs.promises.writeFile(
        path.join(this.appDir, appPage),
        `
${
  globalCssImports.size === 0
    ? ''
    : [...globalCssImports]
        .map((file) => {
          return `import "${path.relative(
            path.join(this.appDir, this.pagesDir),
            file
          )}"`
        })
        .join('\n')
}

export default function MyApp({ Component, pageProps}) {
  return <Component {...pageProps} />
}
        `
      )

      const relativeIndexPath = path.join(
        path.relative(
          path.join(this.appDir, this.pagesDir),
          path.join(this.appDir, 'src')
        ),
        'index.js'
      )

      await fs.promises.writeFile(
        path.join(this.appDir, catchAllPage),
        `
// import NextIndexWrapper from '${relativeIndexPath}'

// next/dynamic is used to prevent breaking incompatibilities 
// with SSR from window.SOME_VAR usage, if this is not used
// next/dynamic can be removed to take advantage of SSR/prerendering
import dynamic from 'next/dynamic'

// try changing "ssr" to true below to test for incompatibilities, if
// no errors occur the above static import can be used instead and the
// below removed
const NextIndexWrapper = dynamic(() => import('${relativeIndexPath}'), { ssr: false })

export default function Page(props) {
  return <NextIndexWrapper {...props} />
}
`
      )
    }
    this.logCreate(appPage)
    this.logCreate(catchAllPage)
  }

  private async updatePackageJson() {
    // rename react-scripts -> next and react-scripts test -> jest
    // add needed dependencies for webpack compatibility
    const newDependencies: Array<{
      name: string
      version: string
    }> = [
      // TODO: do we want to install jest automatically?
      {
        name: 'next',
        version: 'latest',
      },
      {
        name: 'babel-plugin-named-asset-import',
        version: 'latest',
      },
      {
        name: '@svgr/webpack',
        version: 'latest',
      },
    ]
    const packagesToRemove = {
      'react-scripts': undefined,
    }
    const neededDependencies: string[] = []
    const { devDependencies, dependencies, scripts } = this.packageJsonData

    for (const dep of newDependencies) {
      if (!devDependencies?.[dep.name] && !dependencies?.[dep.name]) {
        neededDependencies.push(`${dep.name}@${dep.version}`)
      }
    }

    this.logInfo(
      `Installing ${neededDependencies.join(' ')} with ${this.installClient}`
    )

    if (!this.isDryRun) {
      await fs.promises.writeFile(
        this.packageJsonPath,
        JSON.stringify(
          {
            ...this.packageJsonData,
            scripts: Object.keys(scripts).reduce((prev, cur) => {
              const command = scripts[cur]
              prev[cur] = command

              if (command.includes('react-scripts ')) {
                prev[cur] = command.replace(
                  'react-scripts ',
                  command.includes('react-scripts test') ? 'jest ' : 'next '
                )
              }
              if (cur === 'eject') {
                prev[cur] = undefined
              }
              // TODO: do we want to map start -> next start instead of CRA's
              // default of mapping starting to dev mode?
              if (cur === 'start') {
                prev[cur] = prev[cur].replace('next start', 'next dev')
                prev['start-production'] = 'next start'
              }
              return prev
            }, {} as { [key: string]: string }),
            dependencies: {
              ...dependencies,
              ...packagesToRemove,
            },
            devDependencies: {
              ...devDependencies,
              ...packagesToRemove,
            },
          },
          null,
          2
        )
      )

      install(this.appDir, neededDependencies, {
        useYarn: this.installClient === 'yarn',
        // do we want to detect offline as well? they might not
        // have next in the local cache already
        isOnline: true,
      })
    }
  }

  private async updateGitIgnore() {
    // add Next.js specific items to .gitignore e.g. '.next'
    const gitignorePath = path.join(this.appDir, '.gitignore')
    let ignoreContent = await fs.promises.readFile(gitignorePath, 'utf8')
    const nextIgnores = (
      await fs.promises.readFile(
        path.join(path.dirname(globalCssTransformPath), 'gitignore'),
        'utf8'
      )
    ).split('\n')

    if (!this.isDryRun) {
      for (const ignore of nextIgnores) {
        if (!ignoreContent.includes(ignore)) {
          ignoreContent += `\n${ignore}`
        }
      }

      await fs.promises.writeFile(gitignorePath, ignoreContent)
    }
    this.logModify('.gitignore')
  }

  private async createBabelrc() {
    if (!this.isDryRun) {
      await fs.promises.writeFile(
        path.join(this.appDir, '.babelrc'),
        JSON.stringify(
          {
            presets: ['next/babel'],
            plugins: [
              [
                'babel-plugin-named-asset-import',
                {
                  loaderMap: {
                    svg: {
                      ReactComponent:
                        '@svgr/webpack?-svgo,+titleProp,+ref![path]',
                    },
                  },
                },
              ],
            ],
          },
          null,
          2
        )
      )
    }
    this.logCreate('.babelrc')
  }

  private async createNextConfig() {
    // create next.config.js with:
    // - rewrite for fallback proxying if proxy is configured in package.json
    // - custom webpack config to feature compatibility potentially required from `next/cra-compat`
    // - expose the PUBLIC_URL value in the `env` config to prevent having to rename to NEXT_PUBLIC_URL

    if (!this.isDryRun) {
      await fs.promises.writeFile(
        path.join(this.appDir, 'next.config.js'),
        `
const craCompat = require('/Users/jj/dev/vercel/next.js/packages/next/cra-compat.js')

module.exports = craCompat({${
          this.packageJsonData.proxy
            ? `
      async rewrites() {
        return {
          fallback: [
            {
              source: '/:path*',
              destination: '${this.packageJsonData.proxy}'
            }
          ]
        }
      },`
            : ''
        }
    env: {
      PUBLIC_URL: '${this.packageJsonData.homepage || '/'}'
    },
})
`
      )
    }
    this.logCreate('next.config.js')
  }

  private getPagesDir() {
    // prefer src/pages as CRA uses the src dir by default
    // and attempt falling back to top-level pages dir
    let pagesDir = 'src/pages'

    if (fs.existsSync(path.join(this.appDir, pagesDir))) {
      pagesDir = 'pages'
    }

    if (fs.existsSync(path.join(this.appDir, pagesDir))) {
      fatalMessage(
        `Error: a "./pages" directory already exists, please rename to continue`
      )
    }
    return pagesDir
  }

  private loadPackageJson() {
    let packageJsonData

    try {
      packageJsonData = JSON.parse(
        fs.readFileSync(this.packageJsonPath, 'utf8')
      )
    } catch (err) {
      fatalMessage(
        `Error: failed to load package.json from ${this.packageJsonPath}, ensure provided directory is root of CRA project`
      )
    }

    const { dependencies, devDependencies } = packageJsonData

    if (!dependencies['react-scripts'] && !devDependencies['react-scripts']) {
      fatalMessage(
        `Error: react-scripts was not detected, is this a CRA project?`
      )
    }

    return packageJsonData
  }

  private validateAppDir(files: string[]) {
    if (files.length > 1) {
      fatalMessage(
        `Error: only one directory should be provided for the cra-to-next transform, received ${files.join(
          ', '
        )}`
      )
    }
    const appDir = path.join(process.cwd(), files[0])
    let isValidDirectory = false

    try {
      isValidDirectory = fs.lstatSync(appDir).isDirectory()
    } catch (err) {
      // not a valid directory
    }

    if (!isValidDirectory) {
      fatalMessage(
        `Error: invalid directory provided for the cra-to-next transform, received ${appDir}`
      )
    }
    return appDir
  }
}

export default async function transformer(files, flags) {
  try {
    const craTransform = new CraTransform(files, flags)
    await craTransform.transform()
  } catch (err) {
    fatalMessage(`Error: failed to complete transform`, err)
  }
}
