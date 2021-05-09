import fs from 'fs'
import path from 'path'
import globby from 'globby'
// import cheerio from 'cheerio'
import runJscodeshift from '../lib/run-jscodeshift'
import { globalCssImports } from '../lib/cra-to-next/global-css-transform'
import { indexContext } from '../lib/cra-to-next/index-to-component'

// log error and exit without new stacktrace
function fatalMessage(...logs) {
  console.error(...logs)
  process.exit(1)
}

/*
  TODO:
    - detect if should use typescript for created pages
*/

const globalCssTransformPath = require.resolve(
  '../lib/cra-to-next/global-css-transform.js'
)
const indexTransformPath = require.resolve(
  '../lib/cra-to-next/index-to-component.js'
)

class CraTransform {
  private appDir: string
  private isDryRun: boolean
  private jscodeShiftFlags: { [key: string]: boolean }
  private packageJsonData: { [key: string]: any }
  private pagesDir: string
  private shouldLogInfo: boolean

  constructor(files: string[], flags: { [key: string]: boolean }) {
    this.isDryRun = flags.dry
    this.jscodeShiftFlags = {
      ...flags,
      runInBand: true,
    }
    this.appDir = this.validateAppDir(files)
    this.packageJsonData = this.loadPackageJson()
    this.shouldLogInfo = flags.print || flags.dry
    this.pagesDir = this.getPagesDir()
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

    console.log(globalCssImports)

    if (!this.isDryRun) {
      await fs.promises.mkdir(path.join(this.appDir, this.pagesDir))
    }
    this.logCreate(this.pagesDir)
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

  private async createPages() {
    // modify src/index.js to instead a react component where ReactDOM.render
    // is called
    // create [[...slug]].js page that does a non-ssr next/dynamic import
    // for the render items since there can be an incompatibility with SSR
    // from window.SOME_VAR usage
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
  }

  private updatePackageJson() {
    // rename react-scripts -> next and react-scripts test -> jest
    // add needed dependencies for webpack compatibility
  }

  private updateGitIgnore() {
    // add Next.js specific items to .gitignore e.g. '.next'
  }

  private createNextConfig() {
    // create next.config.js with:
    // - rewrite for fallback proxying if proxy is configured in package.json
    // - custom webpack config to feature compatibility potentially required from `next/cra-compat`
    // - expose the PUBLIC_URL value in the `env` config to prevent having to rename to NEXT_PUBLIC_URL

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
    const packageJsonPath = path.join(this.appDir, 'package.json')
    let packageJsonData

    try {
      packageJsonData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    } catch (err) {
      fatalMessage(
        `Error: failed to load package.json from ${packageJsonPath}, ensure provided directory is root of CRA project`
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
