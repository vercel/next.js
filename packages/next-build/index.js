const JSPackager = require('parcel/src/packagers/JSPackager')
const {glob} = require('parcel/src/utils/glob')
const urlJoin = require('parcel/src/utils/urlJoin');
const path = require('path');
const {promisify} = require('util')
const fs = require('fs')
const loadConfig = require('next-server/next-config').default
const { PHASE_PRODUCTION_BUILD, BUILD_ID_FILE } = require('next-server/constants')
const addMDXtoBundler = require('@mdx-js/parcel-plugin-mdx')
const access = promisify(fs.access)
const writeFile = promisify(fs.writeFile)

const PAGES_ROUTE_NAME_REGEX = /^pages[/\\](.*)\.js$/
const DEFAULT_ROUTE_REGEX = /[/\\]next[/\\]dist[/\\]pages[/\\](.*)\.js$/
const ROUTE_NAME_REGEX = /static[/\\][^/\\]+[/\\]pages[/\\](.*)\.js$/
const ROUTE_NAME_SERVER_REGEX = /[/\\]server[/\\]pages[/\\](.*)\.js$/
const NEXT_RUNTIME_REGEX = /[/\\]next[/\\]dist[/\\]client[/\\]next/

process.env.NODE_ENV = 'production'

async function writeBuildId (distDir, buildId) {
  const buildIdPath = path.join(distDir, BUILD_ID_FILE)
  await writeFile(buildIdPath, buildId, 'utf8')
}

function normalizePageName(page) {
  if(page === 'index') {
    return page
  }

  return page.replace(/(^|\/)index$/, '')
}

function createServerPackager() {
  return class NextServerPackager extends JSPackager {
    getBundleSpecifier(bundle) {
      let name = path.relative(path.dirname(this.bundle.name), bundle.name);
      if (bundle.entryAsset) {
        return [name, bundle.entryAsset.id];
      }

      return name;
    }

    async end() {
      let entry = [];

      // Add the HMR runtime if needed.
      if (this.options.hmr) {
        let asset = await this.bundler.getAsset(
          require.resolve('../builtins/hmr-runtime')
        );
        await this.addAssetToBundle(asset);
        entry.push(asset.id);
      }

      if (await this.writeBundleLoaders()) {
        entry.push(0);
      }

      if (this.bundle.entryAsset && this.externalModules.size === 0) {
        entry.push(this.bundle.entryAsset.id);
      }

      await this.dest.write(
        `},(typeof window !== 'undefined' ? (global.__NEXT_CACHE__ = global.__NEXT_CACHE__ || {}) : {}),` +
          JSON.stringify(entry) +
          ', ' +
          JSON.stringify(this.options.global || null) +
          ')'
      );

      if (this.options.sourceMaps) {
        // Add source map url if a map bundle exists
        let mapBundle = this.bundle.siblingBundlesMap.get('map');
        if (mapBundle) {
          let mapUrl = urlJoin(
            this.options.publicURL,
            path.basename(mapBundle.name)
          );
          await this.write(`\n//# sourceMappingURL=${mapUrl}`);
        }
      }
      await this.dest.end();
    }
  }
}

function createClientPackager({buildId}) {
  return class NextClientPackager extends JSPackager {
    getBundleSpecifier(bundle) {
      let name = path.relative(path.dirname(this.bundle.name), bundle.name);
      if (bundle.entryAsset) {
        return [name, bundle.entryAsset.id];
      }

      return name;
    }

    async start() {
      const result = ROUTE_NAME_REGEX.exec(this.bundle.name) || DEFAULT_ROUTE_REGEX.exec(this.bundle.name)
      if(result) {
        this.isPageBundle = true
        let routeName = result ? result[1] : defaultPage[1]
        // We need to convert \ into / when we are in windows
        // to get the proper route name
        // Here we need to do windows check because it's possible
        // to have "\" in the filename in unix.
        // Anyway if someone did that, he'll be having issues here.
        // But that's something we cannot avoid.
        if (/^win/.test(process.platform)) {
          routeName = routeName.replace(/\\/g, '/')
        }

        routeName = `/${routeName.replace(/(^|\/)index$/, '')}`
        await this.write(`__NEXT_REGISTER_PAGE("${routeName}", function() {var module={};var exports={};`)
      }
      await super.start()
    }

    async end() {
      let entry = [];

      // Add the HMR runtime if needed.
      if (this.options.hmr) {
        let asset = await this.bundler.getAsset(
          require.resolve('../builtins/hmr-runtime')
        );
        await this.addAssetToBundle(asset);
        entry.push(asset.id);
      }

      if (await this.writeBundleLoaders()) {
        entry.push(0);
      }

      if (this.bundle.entryAsset && this.externalModules.size === 0) {
        entry.push(this.bundle.entryAsset.id);
      }

      await this.dest.write(
        `},(typeof window !== 'undefined' ? (window.__NEXT_CACHE__ = window.__NEXT_CACHE__ || {}) : {}),` +
          JSON.stringify(entry) +
          ', ' +
          JSON.stringify(this.options.global || null) +
          ')'
      );

      if(this.isPageBundle) {
        await this.dest.write(
          ';return {page: module.exports.default}})'
        )
      }
      
      if (this.options.sourceMaps) {
        // Add source map url if a map bundle exists
        let mapBundle = this.bundle.siblingBundlesMap.get('map');
        if (mapBundle) {
          let mapUrl = urlJoin(
            this.options.publicURL,
            path.basename(mapBundle.name)
          );
          await this.write(`\n//# sourceMappingURL=${mapUrl}`);
        }
      }
      await this.dest.end();
    }
  }
}

function getPageFiles({dir, config, isClient}) {
  const result = glob.sync(`pages/**/${isClient ? '!(_document)' : ''}*.+(${config.pageExtensions.join('|')})`, { cwd: dir, absolute: true })
  const appPath = path.join(dir, 'pages', '_app.js')
  if(!result.some((item) => item === appPath)) {
    result.push(require.resolve('next/dist/pages/_app.js'))
  }

  const errorPath = path.join(dir, 'pages', '_error.js')
  if(!result.some((item) => item === errorPath)) {
    result.push(require.resolve('next/dist/pages/_error.js'))
  }

  if(!isClient) {
    const documentPath = path.join(dir, 'pages', '_document.js')
    if(!result.some((item) => item === documentPath)) {
      result.push(require.resolve('next/dist/pages/_document.js'))
    }
  }

  return result
}

async function clientBundler({Bundler, dir, buildId, config}) {
  const clientPages = getPageFiles({dir, config, isClient: true})
  const entryFiles = [
    require.resolve('next/dist/client/next.js'),
    ...clientPages
  ];
  
  const options = {
    outDir: path.join(dir, '.next', 'static'),
    watch: false,
    sourceMaps: false,
    minify: true,
    target: 'browser'
  }

  // Initializes a bundler using the entrypoint location and options provided
  const bundler = new Bundler(entryFiles, options);

  // Make sure pages get resolved from the root dir
  bundler.options.rootDir = dir

  bundler.addPackager('js', createClientPackager({buildId}))
  bundler.addAssetType('js', path.join(__dirname, 'nextjsasset.js'))
  bundler.addAssetType('jsx', path.join(__dirname, 'nextjsasset.js'))
  addMDXtoBundler(bundler)

  // Run the bundler, this returns the main bundle
  // Use the events if you're using watch mode as this promise will only trigger once and not for every rebuild
  const mainBundle = await bundler.bundle()
  const manifests = new Set()
  
  function getDynamicBundlesForAsset(entryAsset, entryName) {
    const modulesMapping = {}
    for(const [dep, asset] of entryAsset.depAssets) {
      if(!dep.dynamic) {
        continue
      }

      if(!modulesMapping[dep.name]) {
        modulesMapping[dep.name] = []
      }

      for(const bundle of asset.bundles) {
        modulesMapping[dep.name].push(path.relative(path.dirname(entryName), bundle.name))
      }
    }

    return modulesMapping
  }
  
  const writePromises = []
  for(const [, entryBundle] of mainBundle.childBundles.entries()) {
    if(!ROUTE_NAME_REGEX.exec(entryBundle.name)) {
      continue
    }

    const dynamicBundles = getDynamicBundlesForAsset(entryBundle.entryAsset, entryBundle.name)
    const manifestName = entryBundle.name.replace(options.outDir, path.join(dir, '.next', 'server', 'static')).replace(/\.js$/, '-loadable.json')
    writePromises.push(writeFile(manifestName, JSON.stringify(dynamicBundles), 'utf8'))
  }
  await Promise.all(writePromises)
}

async function serverBundler({Bundler, dir, buildId, config}) {
  const serverPages = getPageFiles({dir, config})
  const entryFiles = serverPages
  
  const options = {
    outDir: path.join(dir, '.next', 'server', 'static'),
    watch: false,
    sourceMaps: false,
    minify: true,
    target: 'node'
  }

  // Initializes a bundler using the entrypoint location and options provided
  const bundler = new Bundler(entryFiles, options);

  // Make sure pages get resolved from the root dir
  bundler.options.rootDir = dir

  bundler.addPackager('js', createServerPackager())
  bundler.addAssetType('js', path.join(__dirname, 'nextjsasset.js'))
  bundler.addAssetType('jsx', path.join(__dirname, 'nextjsasset.js'))
  addMDXtoBundler(bundler)

  // Run the bundler, this returns the main bundle
  // Use the events if you're using watch mode as this promise will only trigger once and not for every rebuild
  const bundle = await bundler.bundle();
}

function rewriteFileName(Bundle, buildId) {
  const nextClientRuntime = require.resolve('next/dist/client/next.js')
  const originalGetHashedBundleName = Bundle.prototype.getHashedBundleName
  Bundle.prototype.getHashedBundleName = function getHashedBundleName(contentHash) {
    const entryAsset = this.entryAsset || this.parentBundle.entryAsset;
    const isEntry = entryAsset.options.entryFiles.includes(entryAsset.name) || Array.from(entryAsset.parentDeps).some(dep => dep.entry);
    const originalResult = originalGetHashedBundleName.call(this, contentHash)
    if(!isEntry) {
      return originalResult
    }

    if(entryAsset.name === nextClientRuntime) {
      return path.join(buildId, 'main.js')
    }

    const result = PAGES_ROUTE_NAME_REGEX.exec(originalResult) || DEFAULT_ROUTE_REGEX.exec(originalResult)
    if(!result) {
      return originalResult
    }

    const page = normalizePageName(result[1])
    const ext = path.extname(originalResult)
    const normalizedPagePath = path.join(buildId, 'pages', page + ext)
    return normalizedPagePath
  }
}

module.exports = async function build({dir, conf}) {
  const config = loadConfig(PHASE_PRODUCTION_BUILD, dir, conf)
  const buildId = await config.generateBuildId().trim() // defaults to a uuid
  const distDir = path.join(dir, config.distDir)

  try {
    await access(dir, (fs.constants || fs).W_OK)
  } catch (err) {
    console.error(`> Failed, build directory is not writeable. https://err.sh/zeit/next.js/build-dir-not-writeable`)
    throw err
  }

  const Bundle = require('parcel/src/Bundle')
  rewriteFileName(Bundle, buildId)

  const Bundler = require('parcel');

  await serverBundler({Bundler, dir, buildId, config})
  await clientBundler({Bundler, dir, buildId, config})
  await writeBuildId(distDir, buildId)
}
