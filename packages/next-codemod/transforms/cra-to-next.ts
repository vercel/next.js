import fs from 'fs'
import path from 'path'
import execa from 'execa'
import globby from 'globby'
import cheerio from 'cheerio'
import { install } from '../lib/install'
import runJscodeshift from '../lib/run-jscodeshift'
import htmlToReactAttributes from '../lib/html-to-react-attributes'
import { indexContext } from '../lib/cra-to-next/index-to-component'
import { globalCssContext } from '../lib/cra-to-next/global-css-transform'

const feedbackMessage = `Please share any feedback on the migration here: https://github.com/vercel/next.js/discussions/25858`

// log error and exit without new stacktrace
function fatalMessage(...logs) {
  console.error(...logs, `\n${feedbackMessage}`)
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
  private isVite: boolean
  private isCra: boolean
  private isDryRun: boolean
  private indexPage: string
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

    const { dependencies, devDependencies } = this.packageJsonData
    const hasDep = (dep) => dependencies?.[dep] || devDependencies?.[dep]

    this.isCra = hasDep('react-scripts')
    this.isVite = !this.isCra && hasDep('vite')

    if (!this.isCra && !this.isVite) {
      fatalMessage(
        `Error: react-scripts was not detected, is this a CRA project?`
      )
    }

    this.shouldUseTypeScript =
      fs.existsSync(path.join(this.appDir, 'tsconfig.json')) ||
      globby.sync('src/**/*.{ts,tsx}', {
        cwd: path.join(this.appDir, 'src'),
      }).length > 0

    this.indexPage = globby.sync(
      [`${this.isCra ? 'index' : 'main'}.{js,jsx,ts,tsx}`],
      {
        cwd: path.join(this.appDir, 'src'),
      }
    )[0]

    if (!this.indexPage) {
      fatalMessage('Error: unable to find `src/index`')
    }
  }

  public async transform() {
    console.log('Transforming CRA project at:', this.appDir)

    // convert src/index.js to a react component to render
    // inside of Next.js instead of the custom render root
    const indexTransformRes = await runJscodeshift(
      indexTransformPath,
      { ...this.jscodeShiftFlags, silent: true, verbose: 0 },
      [path.join(this.appDir, 'src', this.indexPage)]
    )

    if (indexTransformRes.error > 0) {
      fatalMessage(
        `Error: failed to apply transforms for src/${this.indexPage}, please check for syntax errors to continue`
      )
    }

    if (indexContext.multipleRenderRoots) {
      fatalMessage(
        `Error: multiple ReactDOM.render roots in src/${this.indexPage}, migrate additional render roots to use portals instead to continue.\n` +
          `See here for more info: https://reactjs.org/docs/portals.html`
      )
    }

    if (indexContext.nestedRender) {
      fatalMessage(
        `Error: nested ReactDOM.render found in src/${this.indexPage}, please migrate this to a top-level render (no wrapping functions) to continue`
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
        `Error: failed to apply transforms for src/${this.indexPage}, please check for syntax errors to continue`
      )
    }

    if (!this.isDryRun) {
      await fs.promises.mkdir(path.join(this.appDir, this.pagesDir))
    }
    this.logCreate(this.pagesDir)

    if (globalCssContext.reactSvgImports.size > 0) {
      // This de-opts webpack 5 since svg/webpack doesn't support webpack 5 yet,
      // so we don't support this automatically
      fatalMessage(
        `Error: import {ReactComponent} from './logo.svg' is not supported, please use normal SVG imports to continue.\n` +
          `React SVG imports found in:\n${[
            ...globalCssContext.reactSvgImports,
          ].join('\n')}`
      )
    }
    await this.updatePackageJson()
    await this.createNextConfig()
    await this.updateGitIgnore()
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
    const htmlContent = await fs.promises.readFile(
      path.join(this.appDir, `${this.isCra ? 'public/' : ''}index.html`),
      'utf8'
    )
    const $ = cheerio.load(htmlContent)
    // note: title tag and meta[viewport] needs to be placed in _app
    // not _document
    const titleTag = $('title')[0]
    const metaViewport = $('meta[name="viewport"]')[0]
    const headTags = $('head').children()
    const bodyTags = $('body').children()

    const pageExt = this.shouldUseTypeScript ? 'tsx' : 'js'
    const appPage = path.join(this.pagesDir, `_app.${pageExt}`)
    const documentPage = path.join(this.pagesDir, `_document.${pageExt}`)
    const catchAllPage = path.join(this.pagesDir, `[[...slug]].${pageExt}`)

    const gatherTextChildren = (children: CheerioElement[]) => {
      return children
        .map((child) => {
          if (child.type === 'text') {
            return child.data
          }
          return ''
        })
        .join('')
    }

    const serializeAttrs = (attrs: CheerioElement['attribs']) => {
      const attrStr = Object.keys(attrs || {})
        .map((name) => {
          const reactName = htmlToReactAttributes[name] || name
          const value = attrs[name]

          // allow process.env access to work dynamically still
          if (value.match(/%([a-zA-Z0-9_]{0,})%/)) {
            return `${reactName}={\`${value.replace(
              /%([a-zA-Z0-9_]{0,})%/g,
              (subStr) => {
                return `\${process.env.${subStr.substr(1, subStr.length - 2)}}`
              }
            )}\`}`
          }
          return `${reactName}="${value}"`
        })
        .join(' ')

      return attrStr.length > 0 ? ` ${attrStr}` : ''
    }
    const serializedHeadTags: string[] = []
    const serializedBodyTags: string[] = []

    headTags.map((_index, element) => {
      if (
        element.tagName === 'title' ||
        (element.tagName === 'meta' && element.attribs.name === 'viewport')
      ) {
        return element
      }
      let hasChildren = element.children.length > 0
      let serializedAttrs = serializeAttrs(element.attribs)

      if (element.tagName === 'script' || element.tagName === 'style') {
        hasChildren = false
        serializedAttrs += ` dangerouslySetInnerHTML={{ __html: \`${gatherTextChildren(
          element.children
        ).replace(/`/g, '\\`')}\` }}`
      }

      serializedHeadTags.push(
        hasChildren
          ? `<${element.tagName}${serializedAttrs}>${gatherTextChildren(
              element.children
            )}</${element.tagName}>`
          : `<${element.tagName}${serializedAttrs} />`
      )

      return element
    })

    bodyTags.map((_index, element) => {
      if (element.tagName === 'div' && element.attribs.id === 'root') {
        return element
      }
      let hasChildren = element.children.length > 0
      let serializedAttrs = serializeAttrs(element.attribs)

      if (element.tagName === 'script' || element.tagName === 'style') {
        hasChildren = false
        serializedAttrs += ` dangerouslySetInnerHTML={{ __html: \`${gatherTextChildren(
          element.children
        ).replace(/`/g, '\\`')}\` }}`
      }

      serializedHeadTags.push(
        hasChildren
          ? `<${element.tagName}${serializedAttrs}>${gatherTextChildren(
              element.children
            )}</${element.tagName}>`
          : `<${element.tagName}${serializedAttrs} />`
      )

      return element
    })

    if (!this.isDryRun) {
      await fs.promises.writeFile(
        path.join(this.appDir, appPage),
        `${
          globalCssContext.cssImports.size === 0
            ? ''
            : [...globalCssContext.cssImports]
                .map((file) => {
                  if (!this.isCra) {
                    file = file.startsWith('/') ? file.substr(1) : file
                  }

                  return `import '${
                    file.startsWith('/')
                      ? path.relative(
                          path.join(this.appDir, this.pagesDir),
                          file
                        )
                      : file
                  }'`
                })
                .join('\n') + '\n'
        }${titleTag ? `import Head from 'next/head'` : ''}

export default function MyApp({ Component, pageProps}) {
  ${
    titleTag || metaViewport
      ? `return (
    <>
      <Head>
        ${
          titleTag
            ? `<title${serializeAttrs(titleTag.attribs)}>${gatherTextChildren(
                titleTag.children
              )}</title>`
            : ''
        }
        ${metaViewport ? `<meta${serializeAttrs(metaViewport.attribs)} />` : ''}
      </Head>
      
      <Component {...pageProps} />
    </>
  )`
      : 'return <Component {...pageProps} />'
  }
}
`
      )

      await fs.promises.writeFile(
        path.join(this.appDir, documentPage),
        `import Document, { Html, Head, Main, NextScript } from 'next/document'

class MyDocument extends Document {
  render() {
    return (
      <Html${serializeAttrs($('html').attr())}>
        <Head>
          ${serializedHeadTags.join('\n          ')}
        </Head>
        
        <body${serializeAttrs($('body').attr())}>
          <Main />
          <NextScript />
          ${serializedBodyTags.join('\n          ')}
        </body>
      </Html>
    )
  }
}

export default MyDocument      
`
      )

      const relativeIndexPath = path.relative(
        path.join(this.appDir, this.pagesDir),
        path.join(this.appDir, 'src', this.isCra ? '' : 'main')
      )

      // TODO: should we default to ssr: true below and recommend they
      // set it to false if they encounter errors or prefer the more safe
      // option to prevent their first start from having any errors?
      await fs.promises.writeFile(
        path.join(this.appDir, catchAllPage),
        `// import NextIndexWrapper from '${relativeIndexPath}'

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
    this.logCreate(documentPage)
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
    ]
    const packageName = this.isCra ? 'react-scripts' : 'vite'
    const packagesToRemove = {
      [packageName]: undefined,
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

              if (command === packageName) {
                prev[cur] = 'next dev'
              }

              if (command.includes(`${packageName} `)) {
                prev[cur] = command.replace(
                  `${packageName} `,
                  command.includes(`${packageName} test`) ? 'jest ' : 'next '
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

      await install(this.appDir, neededDependencies, {
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

  private async createNextConfig() {
    if (!this.isDryRun) {
      const { proxy, homepage } = this.packageJsonData
      const homepagePath = new URL(homepage || '/', 'http://example.com')
        .pathname

      await fs.promises.writeFile(
        path.join(this.appDir, 'next.config.js'),
        `module.exports = {${
          proxy
            ? `
  async rewrites() {
    return {
      fallback: [
        {
          source: '/:path*',
          destination: '${proxy}'
        }
      ]
    }
  },`
            : ''
        }
  env: {
    PUBLIC_URL: '${homepagePath === '/' ? '' : homepagePath || ''}'
  },
  experimental: {
    craCompat: true,
  },
  // Remove this to leverage Next.js' static image handling
  // read more here: https://nextjs.org/docs/api-reference/next/image
  images: {
    disableStaticImages: true
  }  
}
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

    console.log(`CRA to Next.js migration complete`, `\n${feedbackMessage}`)
  } catch (err) {
    fatalMessage(`Error: failed to complete transform`, err)
  }
}
