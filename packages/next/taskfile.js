const { relative, basename, resolve, join, dirname } = require('path')
const glob = require('glob')
const fs = require('fs/promises')
const resolveFrom = require('resolve-from')
const execa = require('execa')
const process = require('process')
const recast = require('recast')

export async function next__polyfill_nomodule(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('@next/polyfill-nomodule')))
    .target('dist/build/polyfills')
}

export async function next__polyfill_module(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('@next/polyfill-module')))
    .target('dist/build/polyfills')
}

export async function browser_polyfills(task, opts) {
  await task.parallel(
    ['next__polyfill_nomodule', 'next__polyfill_module'],
    opts
  )
}

export async function copy_regenerator_runtime(task, opts) {
  await task
    .source(join(dirname(require.resolve('regenerator-runtime')), '**/*'))
    .target('src/compiled/regenerator-runtime')
}

export async function copy_styled_jsx_assets(task, opts) {
  // we copy the styled-jsx types so that we can reference them
  // in the next-env.d.ts file so it doesn't matter if the styled-jsx
  // package is hoisted out of Next.js' node_modules or not
  const styledJsxPath = dirname(require.resolve('styled-jsx/package.json'))
  const typeFiles = glob.sync('*.d.ts', { cwd: styledJsxPath })
  const outputDir = join(__dirname, 'dist/styled-jsx')
  // Separate type files into different folders to avoid conflicts between
  // dev dep `styled-jsx` and `next/dist/styled-jsx` for duplicated declare modules
  const typesDir = join(outputDir, 'types')
  await fs.mkdir(typesDir, { recursive: true })

  for (const file of typeFiles) {
    const content = await fs.readFile(join(styledJsxPath, file), 'utf8')
    await fs.writeFile(join(typesDir, file), content)
  }
}

const externals = {
  // don't bundle caniuse-lite data so users can
  // update it manually
  'caniuse-lite': 'caniuse-lite',
  '/caniuse-lite(/.*)/': 'caniuse-lite$1',

  postcss: 'postcss',
  // Ensure latest version is used
  'postcss-safe-parser': 'next/dist/compiled/postcss-safe-parser',

  // sass-loader
  // (also responsible for these dependencies in package.json)
  'node-sass': 'node-sass',
  sass: 'sass',
  fibers: 'fibers',

  chokidar: 'chokidar',
  'jest-worker': 'jest-worker',

  'terser-webpack-plugin':
    'next/dist/build/webpack/plugins/terser-webpack-plugin/src',

  punycode: 'punycode/',
  // TODO: Add @swc/helpers to externals once @vercel/ncc switch to swc-loader
}
externals['node-html-parser'] = 'next/dist/compiled/node-html-parser'
export async function ncc_node_html_parser(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('node-html-parser')))
    .ncc({
      packageName: 'node-html-parser',
      externals,
      target: 'es5',
    })
    .target('src/compiled/node-html-parser')
}

externals['busboy'] = 'next/dist/compiled/busboy'
export async function ncc_busboy(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('busboy')))
    .ncc({
      packageName: 'busboy',
      externals,
      target: 'es5',
    })
    .target('src/compiled/busboy')
}

externals['@mswjs/interceptors/ClientRequest'] =
  'next/dist/compiled/@mswjs/interceptors/ClientRequest'
export async function ncc_mswjs_interceptors(task, opts) {
  await task
    .source(
      relative(__dirname, require.resolve('@mswjs/interceptors/ClientRequest'))
    )
    .ncc({
      packageName: '@mswjs/interceptors/ClientRequest',
      externals,
      target: 'es5',
    })
    .target('src/compiled/@mswjs/interceptors/ClientRequest')
}

export async function capsize_metrics() {
  const {
    entireMetricsCollection,
  } = require('@capsizecss/metrics/entireMetricsCollection')
  const outputPathDist = join(
    __dirname,
    'dist/server/capsize-font-metrics.json'
  )

  await writeJson(outputPathDist, entireMetricsCollection, { spaces: 2 })
}

externals['@babel/runtime'] = 'next/dist/compiled/@babel/runtime'
export async function copy_babel_runtime(task, opts) {
  const runtimeDir = dirname(require.resolve('@babel/runtime/package.json'))
  const outputDir = join(__dirname, 'src/compiled/@babel/runtime')
  const runtimeFiles = glob.sync('**/*', {
    cwd: runtimeDir,
    ignore: ['node_modules/**/*'],
  })

  for (const file of runtimeFiles) {
    const inputPath = join(runtimeDir, file)
    const outputPath = join(outputDir, file)

    if (!(await fs.stat(inputPath)).isFile()) {
      continue
    }
    let contents = await fs.readFile(inputPath, 'utf8')

    if (inputPath.endsWith('.js')) {
      contents = contents
        .replace(
          'regenerator-runtime',
          'next/dist/compiled/regenerator-runtime'
        )
        .replace('@babel/runtime', 'next/dist/compiled/@babel/runtime')
    }

    if (inputPath.endsWith('package.json')) {
      contents = JSON.stringify({
        ...JSON.parse(contents),
        dependencies: {},
      })
    }

    await fs.mkdir(dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, contents)
  }
}

externals['@vercel/og'] = 'next/dist/compiled/@vercel/og'
export async function copy_vercel_og(task, opts) {
  function copy_og_asset(globPattern) {
    return task
      .source(
        join(
          relative(
            __dirname,
            dirname(require.resolve('@vercel/og/package.json'))
          ),
          globPattern
        )
      )
      .target('src/compiled/@vercel/og')
  }

  await copy_og_asset('./dist/*.ttf')
  await copy_og_asset('./dist/*.wasm')
  await copy_og_asset('LICENSE')
  await copy_og_asset('./dist/index.*.js')

  // Types are not bundled, include satori types here
  await task
    .source(
      join(dirname(require.resolve('satori/package.json')), 'dist/index.d.ts')
    )
    // eslint-disable-next-line require-yield
    .run({ every: true }, function* (file) {
      const source = file.data.toString()
      // Ignore yoga-wasm-web types
      file.data = source.replace(
        /import { Yoga } from ['"]yoga-wasm-web['"]/g,
        'type Yoga = any'
      )
    })
    .target('src/compiled/@vercel/og/satori')
  await task
    .source(join(dirname(require.resolve('satori/package.json')), 'LICENSE'))
    .target('src/compiled/@vercel/og/satori')

  await task
    .source(
      join(
        dirname(require.resolve('@vercel/og/package.json')),
        'dist/**/*.d.ts'
      )
    )
    // eslint-disable-next-line require-yield
    .run({ every: true }, function* (file) {
      const source = file.data.toString()
      // Refers to copied satori types
      file.data = source
        .replace(/['"]satori['"]/g, '"next/dist/compiled/@vercel/og/satori"')
        .replace("typeof import('@resvg/resvg-wasm')", 'any')
    })
    .target('src/compiled/@vercel/og')

  await writeJson(
    join(__dirname, 'src/compiled/@vercel/og/package.json'),
    {
      name: '@vercel/og',
      version: require('@vercel/og/package.json').version,
      license: 'MPL-2.0',
      type: 'module',
      main: './index.node.js',
      exports: {
        '.': {
          'edge-light': './index.edge.js',
          import: './index.node.js',
          node: './index.node.js',
          default: './index.node.js',
        },
        './package.json': './package.json',
      },
    },
    { spaces: 2 }
  )
}

externals['anser'] = 'next/dist/compiled/anser'
externals['next/dist/compiled/anser'] = 'next/dist/compiled/anser'
export async function ncc_node_anser(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('anser')))
    .ncc({ packageName: 'anser', externals })
    .target('src/compiled/anser')
}

externals['stacktrace-parser'] = 'next/dist/compiled/stacktrace-parser'
externals['next/dist/compiled/stacktrace-parser'] =
  'next/dist/compiled/stacktrace-parser'
export async function ncc_node_stacktrace_parser(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('stacktrace-parser')))
    .ncc({ packageName: 'stacktrace-parser', externals })
    .target('src/compiled/stacktrace-parser')
}

externals['data-uri-to-buffer'] = 'next/dist/compiled/data-uri-to-buffer'
externals['next/dist/compiled/data-uri-to-buffer'] =
  'next/dist/compiled/data-uri-to-buffer'
export async function ncc_node_data_uri_to_buffer(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('data-uri-to-buffer')))
    .ncc({ packageName: 'data-uri-to-buffer', externals })
    .target('src/compiled/data-uri-to-buffer')
}

externals['css.escape'] = 'next/dist/compiled/css.escape'
externals['next/dist/compiled/css.escape'] = 'next/dist/compiled/css.escape'
export async function ncc_node_cssescape(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('css.escape')))
    .ncc({ packageName: 'css.escape', externals })
    .target('src/compiled/css.escape')
}

externals['shell-quote'] = 'next/dist/compiled/shell-quote'
externals['next/dist/compiled/shell-quote'] = 'next/dist/compiled/shell-quote'
export async function ncc_node_shell_quote(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('shell-quote')))
    .ncc({ packageName: 'shell-quote', externals })
    .target('src/compiled/shell-quote')
}

externals['acorn'] = 'next/dist/compiled/acorn'
export async function ncc_acorn(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('acorn')))
    .ncc({ packageName: 'acorn', externals })
    .target('src/compiled/acorn')
}

externals['@edge-runtime/cookies'] = 'next/dist/compiled/@edge-runtime/cookies'

export async function ncc_edge_runtime_cookies() {
  // `@edge-runtime/cookies` is precompiled and pre-bundled
  // so we vendor the package as it is.
  const dest = 'src/compiled/@edge-runtime/cookies'
  const pkg = await readJson(
    require.resolve('@edge-runtime/cookies/package.json')
  )
  await rmrf(dest)
  await fs.mkdir(dest, { recursive: true })

  await writeJson(join(dest, 'package.json'), {
    name: '@edge-runtime/cookies',
    version: pkg.version,
    main: './index.js',
    license: pkg.license,
  })

  await fs.cp(
    require.resolve('@edge-runtime/cookies/dist/index.js'),
    join(dest, 'index.js')
  )
  await fs.cp(
    require.resolve('@edge-runtime/cookies/dist/index.d.ts'),
    join(dest, 'index.d.ts')
  )
}

externals['@edge-runtime/primitives'] =
  'next/dist/compiled/@edge-runtime/primitives'

export async function ncc_edge_runtime_primitives() {
  // `@edge-runtime/primitives` is precompiled and pre-bundled
  // so we vendor the package as it is.
  const dest = 'src/compiled/@edge-runtime/primitives'
  await fs.mkdir(dest, { recursive: true })
  const primitivesPath = dirname(
    require.resolve('@edge-runtime/primitives/package.json')
  )
  const pkg = await readJson(
    require.resolve('@edge-runtime/primitives/package.json')
  )
  await rmrf(dest)

  for (const file of await fs.readdir(join(primitivesPath, 'types'))) {
    await fs.cp(join(primitivesPath, 'types', file), join(dest, file))
  }

  for (const file of await fs.readdir(join(primitivesPath, 'dist'))) {
    await fs.cp(join(primitivesPath, 'dist', file), join(dest, file))
  }

  await writeJson(join(dest, 'package.json'), {
    name: '@edge-runtime/primitives',
    version: pkg.version,
    main: './index.js',
    license: pkg.license,
  })
  await fs.cp(
    require.resolve('@edge-runtime/primitives'),
    join(dest, 'index.js')
  )
  await fs.cp(
    require.resolve('@edge-runtime/primitives/types/index.d.ts'),
    join(dest, 'index.d.ts')
  )
}

externals['@edge-runtime/ponyfill'] =
  'next/dist/compiled/@edge-runtime/ponyfill'
export async function ncc_edge_runtime_ponyfill(task, opts) {
  const indexFile = await fs.readFile(
    require.resolve('@edge-runtime/ponyfill/src/index.js'),
    'utf8'
  )
  const dest = 'src/compiled/@edge-runtime/ponyfill'
  await fs.mkdir(dest, { recursive: true })
  await fs.writeFile(
    join(dest, 'index.js'),
    indexFile.replace(
      `require('@edge-runtime/primitives')`,
      `require(${JSON.stringify(externals['@edge-runtime/primitives'])})`
    )
  )
  await fs.cp(
    require.resolve('@edge-runtime/ponyfill/src/index.d.ts'),
    join(dest, 'index.d.ts')
  )

  const pkg = await readJson(
    require.resolve('@edge-runtime/ponyfill/package.json')
  )

  await writeJson(join(dest, 'package.json'), {
    name: '@edge-runtime/ponyfill',
    version: pkg.version,
    main: './index.js',
    types: './index.d.ts',
    license: pkg.license,
  })
}

externals['edge-runtime'] = 'next/dist/compiled/edge-runtime'
export async function ncc_edge_runtime(task, opts) {
  const vmPath = resolveFrom(
    dirname(require.resolve('edge-runtime')),
    '@edge-runtime/vm/dist/edge-vm'
  )

  const content = await fs.readFile(vmPath, 'utf8')

  // ensure ncc doesn't attempt to bundle dynamic requires
  // so that they work at runtime correctly
  await fs.writeFile(
    vmPath,
    content.replace(
      /require\.resolve\('@edge-runtime\/primitives/g,
      `__non_webpack_require__.resolve('next/dist/compiled/@edge-runtime/primitives`
    )
  )

  await task
    .source(relative(__dirname, require.resolve('edge-runtime')))
    .ncc({ packageName: 'edge-runtime', externals })
    .target('src/compiled/edge-runtime')

  const outputFile = join(__dirname, 'src/compiled/edge-runtime/index.js')

  await fs.writeFile(
    outputFile,
    (await fs.readFile(outputFile, 'utf8')).replace(
      /eval\("require"\)/g,
      'require'
    )
  )
}

export async function ncc_next_font(task, opts) {
  // `@next/font` can be copied as is, its only dependency is already NCCed
  const destDir = join(__dirname, 'dist/compiled/@next/font')
  const pkgPath = require.resolve('@next/font/package.json')
  const pkg = await readJson(pkgPath)
  const srcDir = dirname(pkgPath)
  await rmrf(destDir)
  await fs.mkdir(destDir, { recursive: true })

  const files = glob.sync('{dist,google,local}/**/*.{js,json,d.ts}', {
    cwd: srcDir,
  })

  for (const file of files) {
    const outputFile = join(destDir, file)
    await fs.mkdir(dirname(outputFile), { recursive: true })
    await fs.cp(join(srcDir, file), outputFile)
  }

  await writeJson(join(destDir, 'package.json'), {
    name: '@next/font',
    license: pkg.license,
    types: pkg.types,
  })
}

externals['watchpack'] = 'next/dist/compiled/watchpack'
export async function ncc_watchpack(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('watchpack')))
    .ncc({ packageName: 'watchpack', externals })
    .target('src/compiled/watchpack')
}

externals['jest-worker'] = 'next/dist/compiled/jest-worker'
export async function ncc_jest_worker(task, opts) {
  await rmrf(join(__dirname, 'src/compiled/jest-worker'))
  await fs.mkdir(join(__dirname, 'src/compiled/jest-worker/workers'), {
    recursive: true,
  })

  const workers = ['processChild.js', 'threadChild.js']

  await task
    .source(relative(__dirname, require.resolve('jest-worker')))
    .ncc({ packageName: 'jest-worker', externals })
    .target('src/compiled/jest-worker')

  for (const worker of workers) {
    const content = await fs.readFile(
      join(
        dirname(require.resolve('jest-worker/package.json')),
        'build/workers',
        worker
      ),
      'utf8'
    )
    await fs.writeFile(
      join(
        dirname(require.resolve('jest-worker/package.json')),
        'build/workers',
        worker + '.tmp.js'
      ),
      content.replace(/require\(file\)/g, '__non_webpack_require__(file)')
    )
    await task
      .source(
        relative(
          __dirname,
          join(
            dirname(require.resolve('jest-worker/package.json')),
            'build/workers',
            worker + '.tmp.js'
          )
        )
      )
      .ncc({ externals })
      .target('src/compiled/jest-worker/out')

    await fs.rename(
      join(__dirname, 'src/compiled/jest-worker/out', worker + '.tmp.js'),
      join(__dirname, 'src/compiled/jest-worker', worker)
    )
  }
  await rmrf(join(__dirname, 'src/compiled/jest-worker/workers'))
  await rmrf(join(__dirname, 'src/compiled/jest-worker/out'))
}

export async function ncc_react_refresh_utils(task, opts) {
  await rmrf(join(__dirname, 'dist/compiled/react-refresh'))
  await fs.cp(
    dirname(require.resolve('react-refresh/package.json')),
    join(__dirname, 'dist/compiled/react-refresh'),
    { recursive: true, force: true }
  )

  const srcDir = join(
    dirname(require.resolve('@next/react-refresh-utils/package.json')),
    'dist'
  )
  const destDir = join(
    __dirname,
    'dist/compiled/@next/react-refresh-utils/dist'
  )
  await rmrf(destDir)
  await fs.mkdir(destDir, { recursive: true })

  const files = glob.sync('**/*.{js,json,map}', { cwd: srcDir })

  for (const file of files) {
    if (file === 'tsconfig.json') continue

    const content = await fs.readFile(join(srcDir, file), 'utf8')
    const outputFile = join(destDir, file)

    await fs.mkdir(dirname(outputFile), { recursive: true })
    await fs.writeFile(
      outputFile,
      content.replace(
        /react-refresh\/runtime/g,
        'next/dist/compiled/react-refresh/runtime'
      )
    )
  }
}

externals['browserslist'] = 'next/dist/compiled/browserslist'
export async function ncc_browserslist(task, opts) {
  const browserslistModule = require.resolve('browserslist')
  const nodeFile = join(dirname(browserslistModule), 'node.js')

  const content = await fs.readFile(nodeFile, 'utf8')
  // ensure ncc doesn't attempt to bundle dynamic requires
  // so that they work at runtime correctly
  await fs.writeFile(
    nodeFile,
    content.replace(
      /require\(require\.resolve\(/g,
      `__non_webpack_require__(__non_webpack_require__.resolve(`
    )
  )

  await task
    .source(relative(__dirname, require.resolve('browserslist')))
    .ncc({ packageName: 'browserslist', externals })
    // eslint-disable-next-line require-yield
    .run({ every: true }, function* (file) {
      const source = file.data.toString()
      // We replace the module/chunk loading code with our own implementation in Next.js.
      file.data = source.replace(
        /process\.env\.BROWSERSLIST_IGNORE_OLD_DATA/g,
        'true'
      )
    })
    .target('src/compiled/browserslist')

  await fs.writeFile(nodeFile, content)
}

externals['@napi-rs/triples'] = 'next/dist/compiled/@napi-rs/triples'
export async function ncc_napirs_triples(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('@napi-rs/triples')))
    .ncc({ packageName: '@napi-rs/triples', externals })
    .target('src/compiled/@napi-rs/triples')
}

externals['p-limit'] = 'next/dist/compiled/p-limit'
export async function ncc_p_limit(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('p-limit')))
    .ncc({ packageName: 'p-limit', externals })
    .target('src/compiled/p-limit')
}

externals['p-queue'] = 'next/dist/compiled/p-queue'
export async function ncc_p_queue(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('p-queue')))
    .ncc({ packageName: 'p-queue', externals })
    .target('src/compiled/p-queue')
}

externals['raw-body'] = 'next/dist/compiled/raw-body'
export async function ncc_raw_body(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('raw-body')))
    .ncc({ packageName: 'raw-body', externals })
    .target('src/compiled/raw-body')
}

externals['image-size'] = 'next/dist/compiled/image-size'
export async function ncc_image_size(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('image-size')))
    .ncc({ packageName: 'image-size', externals })
    .target('src/compiled/image-size')
}

externals['image-detector'] = 'next/dist/compiled/image-detector'
export async function ncc_image_detector(task, opts) {
  // NOTE: remove this special compile step if the upstream PR lands
  // https://github.com/image-size/image-size/pull/451
  await task
    .source(relative(__dirname, require.resolve('image-size/dist/detector.js')))
    .ncc({ packageName: 'image-size', externals })
    .target('src/compiled/image-detector')
}

externals['@hapi/accept'] = 'next/dist/compiled/@hapi/accept'
export async function ncc_hapi_accept(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('@hapi/accept')))
    .ncc({ packageName: '@hapi/accept', externals })
    .target('src/compiled/@hapi/accept')
}

export async function ncc_assert(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('assert/')))
    .ncc({
      packageName: 'assert',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/assert')
}

export async function ncc_browser_zlib(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('browserify-zlib/')))
    .ncc({
      packageName: 'browserify-zlib',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/browserify-zlib')
}

export async function ncc_buffer(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('buffer/')))
    .ncc({
      packageName: 'buffer',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/buffer')
}

export async function copy_constants_browserify(task, opts) {
  await fs.mkdir(join(__dirname, 'src/compiled/constants-browserify'), {
    recursive: true,
  })
  await writeJson(
    join(__dirname, 'src/compiled/constants-browserify/package.json'),
    { name: 'constants-browserify', main: './constants.json' }
  )
  await task
    .source(require.resolve('constants-browserify'))
    .target('src/compiled/constants-browserify')
}

export async function ncc_crypto_browserify(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('crypto-browserify/')))
    .ncc({
      packageName: 'crypto-browserify',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/crypto-browserify')
}

export async function ncc_domain_browser(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('domain-browser/')))
    .ncc({
      packageName: 'domain-browser',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/domain-browser')
}

export async function ncc_events(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('events/')))
    .ncc({
      packageName: 'events',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/events')
}

export async function ncc_stream_browserify(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('stream-browserify/')))
    .ncc({
      packageName: 'stream-browserify',
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/stream-browserify')

  // while ncc'ing readable-stream the browser mapping does not replace the
  // require('stream') with require('events').EventEmitter correctly so we
  // patch this manually as leaving require('stream') causes a circular
  // reference breaking the browser polyfill
  const outputFile = join(__dirname, 'src/compiled/stream-browserify/index.js')

  await fs.writeFile(
    outputFile,
    (await fs.readFile(outputFile, 'utf8')).replace(
      `require("stream")`,
      `require("events").EventEmitter`
    )
  )
}

export async function ncc_stream_http(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('stream-http/')))
    .ncc({
      packageName: 'stream-http',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/stream-http')
}

export async function ncc_https_browserify(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('https-browserify/')))
    .ncc({
      packageName: 'https-browserify',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/https-browserify')
}

export async function ncc_os_browserify(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('os-browserify/browser')))
    .ncc({
      packageName: 'os-browserify',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/os-browserify')
}

export async function ncc_path_browserify(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('path-browserify/')))
    .ncc({
      packageName: 'path-browserify',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/path-browserify')

  const filePath = join(__dirname, 'src/compiled/path-browserify/index.js')
  const content = await fs.readFile(filePath, 'utf8')

  // Remove process usage from path-browserify polyfill for edge-runtime
  await fs.writeFile(filePath, content.replace(/process\.cwd\(\)/g, '""'))
}

export async function ncc_process(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('process/browser')))
    .ncc({
      packageName: 'process',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/process')
}

export async function ncc_querystring_es3(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('querystring-es3/')))
    .ncc({
      packageName: 'querystring-es3',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/querystring-es3')
}

export async function ncc_string_decoder(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('string_decoder/')))
    .ncc({
      packageName: 'string_decoder',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/string_decoder')
}

export async function ncc_util(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('util/')))
    .ncc({
      packageName: 'util',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/util')
}

export async function ncc_punycode(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('punycode/')))
    .ncc({
      packageName: 'punycode',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/punycode')
}

export async function ncc_set_immediate(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('setimmediate/')))
    .ncc({
      packageName: 'setimmediate',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/setimmediate')
}

export async function ncc_timers_browserify(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('timers-browserify/')))
    .ncc({
      packageName: 'timers-browserify',
      externals: {
        ...externals,
        setimmediate: 'next/dist/compiled/setimmediate',
      },
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/timers-browserify')
}

export async function ncc_tty_browserify(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('tty-browserify/')))
    .ncc({
      packageName: 'tty-browserify',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/tty-browserify')
}

export async function ncc_vm_browserify(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('vm-browserify/')))
    .ncc({
      packageName: 'vm-browserify',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/vm-browserify')
}

externals['async-retry'] = 'next/dist/compiled/async-retry'
export async function ncc_async_retry(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('async-retry')))
    .ncc({
      packageName: 'async-retry',
      externals,
    })
    .target('src/compiled/async-retry')
}
externals['async-sema'] = 'next/dist/compiled/async-sema'
export async function ncc_async_sema(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('async-sema')))
    .ncc({ packageName: 'async-sema', externals })
    .target('src/compiled/async-sema')
}

externals['postcss-plugin-stub-for-cssnano-simple'] =
  'next/dist/compiled/postcss-plugin-stub-for-cssnano-simple'
export async function ncc_postcss_plugin_stub_for_cssnano_simple(task, opts) {
  await task
    .source('src/bundles/postcss-plugin-stub/index.js')
    .ncc({
      externals,
    })
    .target('src/compiled/postcss-plugin-stub-for-cssnano-simple')
}

const babelCorePackages = {
  'code-frame': 'next/dist/compiled/babel/code-frame',
  '@babel/generator': 'next/dist/compiled/babel/generator',
  '@babel/traverse': 'next/dist/compiled/babel/traverse',
  '@babel/types': 'next/dist/compiled/babel/types',
  '@babel/core': 'next/dist/compiled/babel/core',
  '@babel/parser': 'next/dist/compiled/babel/parser',
  '@babel/core/lib/config': 'next/dist/compiled/babel/core-lib-config',
  '@babel/core/lib/transformation/normalize-file':
    'next/dist/compiled/babel/core-lib-normalize-config',
  '@babel/core/lib/transformation/normalize-opts':
    'next/dist/compiled/babel/core-lib-normalize-opts',
  '@babel/core/lib/transformation/block-hoist-plugin':
    'next/dist/compiled/babel/core-lib-block-hoisting-plugin',
  '@babel/core/lib/transformation/plugin-pass':
    'next/dist/compiled/babel/core-lib-plugin-pass',
}
externals['next/dist/compiled/babel/code-frame'] =
  'next/dist/compiled/babel/code-frame'

externals['next/dist/compiled/babel-code-frame'] =
  'next/dist/compiled/babel-code-frame'

Object.assign(externals, babelCorePackages)

export async function ncc_babel_bundle(task, opts) {
  const bundleExternals = {
    ...externals,
    'next/dist/compiled/babel-packages': 'next/dist/compiled/babel-packages',
  }
  for (const pkg of Object.keys(babelCorePackages)) {
    delete bundleExternals[pkg]
  }
  await task
    .source('src/bundles/babel/bundle.js')
    .ncc({
      packageName: '@babel/core',
      bundleName: 'babel',
      externals: bundleExternals,
    })
    .target('src/compiled/babel')
}

export async function ncc_babel_code_frame(task, opts) {
  const bundleExternals = {
    ...externals,
    'next/dist/compiled/babel-packages': 'next/dist/compiled/babel-packages',
  }
  await task
    .source('src/bundles/babel-code-frame/index.js')
    .ncc({
      packageName: '@babel/code-frame',
      bundleName: 'babel-code-frame',
      externals: bundleExternals,
    })
    .target('src/compiled/babel-code-frame')
}

export async function ncc_babel_bundle_packages(task, opts) {
  const eslintParseFile = join(
    dirname(require.resolve('@babel/eslint-parser')),
    './parse.cjs'
  )
  const content = await fs.readFile(eslintParseFile, 'utf-8')
  // Let parser.cjs require @babel/parser directly
  const replacedContent = content
    .replace(
      `const babelParser = require((`,
      `function noop(){};\nconst babelParser = require('@babel/parser');noop((`
    )
    .replace(/require.resolve/g, 'noop')
  await fs.writeFile(eslintParseFile, replacedContent)

  await task
    .source('src/bundles/babel/packages-bundle.js')
    .ncc({
      externals: externals,
    })
    .target(`src/compiled/babel-packages`)

  await writeJson(join(__dirname, 'src/compiled/babel-packages/package.json'), {
    name: 'babel-packages',
    main: './packages-bundle.js',
  })

  await task.source('src/bundles/babel/packages/*').target('src/compiled/babel')
}

externals['cssnano-simple'] = 'next/dist/compiled/cssnano-simple'
export async function ncc_cssnano_simple_bundle(task, opts) {
  const bundleExternals = {
    ...externals,
    'postcss-svgo': 'next/dist/compiled/postcss-plugin-stub-for-cssnano-simple',
  }

  await task
    .source('src/bundles/cssnano-simple/index.js')
    .ncc({
      externals: bundleExternals,
    })
    .target('src/compiled/cssnano-simple')
}

externals['bytes'] = 'next/dist/compiled/bytes'
export async function ncc_bytes(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('bytes')))
    .ncc({ packageName: 'bytes', externals })
    .target('src/compiled/bytes')
}
externals['ci-info'] = 'next/dist/compiled/ci-info'
export async function ncc_ci_info(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('ci-info')))
    .ncc({ packageName: 'ci-info', externals })
    .target('src/compiled/ci-info')
}
externals['cli-select'] = 'next/dist/compiled/cli-select'
export async function ncc_cli_select(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('cli-select')))
    .ncc({ packageName: 'cli-select', externals })
    .target('src/compiled/cli-select')
}
externals['commander'] = 'next/dist/compiled/commander'
export async function ncc_commander(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('commander')))
    .ncc({ packageName: 'commander', externals })
    .target('src/compiled/commander')
}
externals['comment-json'] = 'next/dist/compiled/comment-json'
export async function ncc_comment_json(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('comment-json')))
    .ncc({ packageName: 'comment-json', externals })
    .target('src/compiled/comment-json')
}
externals['compression'] = 'next/dist/compiled/compression'
export async function ncc_compression(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('compression')))
    .ncc({ packageName: 'compression', externals })
    .target('src/compiled/compression')
}
externals['conf'] = 'next/dist/compiled/conf'
export async function ncc_conf(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('conf')))
    .ncc({ packageName: 'conf', externals })
    .target('src/compiled/conf')
}
externals['content-disposition'] = 'next/dist/compiled/content-disposition'
export async function ncc_content_disposition(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('content-disposition')))
    .ncc({ packageName: 'content-disposition', externals })
    .target('src/compiled/content-disposition')
}
externals['content-type'] = 'next/dist/compiled/content-type'
export async function ncc_content_type(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('content-type')))
    .ncc({ packageName: 'content-type', externals })
    .target('src/compiled/content-type')
}
externals['cookie'] = 'next/dist/compiled/cookie'
export async function ncc_cookie(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('cookie')))
    .ncc({ packageName: 'cookie', externals })
    .target('src/compiled/cookie')
}
externals['cross-spawn'] = 'next/dist/compiled/cross-spawn'
export async function ncc_cross_spawn(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('cross-spawn')))
    .ncc({ packageName: 'cross-spawn', externals })
    .target('src/compiled/cross-spawn')
}
externals['debug'] = 'next/dist/compiled/debug'
export async function ncc_debug(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('debug')))
    .ncc({ packageName: 'debug', externals })
    .target('src/compiled/debug')
}
externals['devalue'] = 'next/dist/compiled/devalue'
export async function ncc_devalue(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('devalue')))
    .ncc({ packageName: 'devalue', externals })
    .target('src/compiled/devalue')
}

externals['find-up'] = 'next/dist/compiled/find-up'
export async function ncc_find_up(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('find-up')))
    .ncc({ packageName: 'find-up', externals })
    .target('src/compiled/find-up')
}
externals['fresh'] = 'next/dist/compiled/fresh'
export async function ncc_fresh(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('fresh')))
    .ncc({ packageName: 'fresh', externals })
    .target('src/compiled/fresh')
}
externals['glob'] = 'next/dist/compiled/glob'
export async function ncc_glob(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('glob')))
    .ncc({ packageName: 'glob', externals })
    .target('src/compiled/glob')
}
externals['gzip-size'] = 'next/dist/compiled/gzip-size'
export async function ncc_gzip_size(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('gzip-size')))
    .ncc({ packageName: 'gzip-size', externals })
    .target('src/compiled/gzip-size')
}
externals['http-proxy'] = 'next/dist/compiled/http-proxy'
export async function ncc_http_proxy(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('http-proxy')))
    .ncc({ packageName: 'http-proxy', externals })
    .target('src/compiled/http-proxy')
}
externals['ignore-loader'] = 'next/dist/compiled/ignore-loader'
export async function ncc_ignore_loader(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('ignore-loader')))
    .ncc({ packageName: 'ignore-loader', externals })
    .target('src/compiled/ignore-loader')
}
externals['is-animated'] = 'next/dist/compiled/is-animated'
export async function ncc_is_animated(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('is-animated')))
    .ncc({ packageName: 'is-animated', externals })
    .target('src/compiled/is-animated')
}
externals['is-local-address'] = 'next/dist/compiled/is-local-address'
export async function ncc_is_local_address(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('is-local-address')))
    .ncc({ packageName: 'is-local-address', externals })
    .target('src/compiled/is-local-address')
}
externals['is-docker'] = 'next/dist/compiled/is-docker'
export async function ncc_is_docker(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('is-docker')))
    .ncc({ packageName: 'is-docker', externals })
    .target('src/compiled/is-docker')
}
externals['is-wsl'] = 'next/dist/compiled/is-wsl'
export async function ncc_is_wsl(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('is-wsl')))
    .ncc({ packageName: 'is-wsl', externals })
    .target('src/compiled/is-wsl')
}
externals['json5'] = 'next/dist/compiled/json5'
export async function ncc_json5(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('json5')))
    .ncc({ packageName: 'json5', externals })
    .target('src/compiled/json5')
}
externals['jsonwebtoken'] = 'next/dist/compiled/jsonwebtoken'
export async function ncc_jsonwebtoken(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('jsonwebtoken')))
    .ncc({
      packageName: 'jsonwebtoken',
      externals: {
        ...externals,
        semver: 'next/dist/lib/semver-noop',
      },
    })
    .target('src/compiled/jsonwebtoken')
}
externals['loader-runner'] = 'next/dist/compiled/loader-runner'
export async function ncc_loader_runner(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('loader-runner')))
    .ncc({ packageName: 'loader-runner', externals })
    .target('src/compiled/loader-runner')
}
externals['loader-utils'] = 'error loader-utils version not specified'
externals['loader-utils2'] = 'next/dist/compiled/loader-utils2'
export async function ncc_loader_utils2(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('loader-utils2')))
    .ncc({ packageName: 'loader-utils2', externals })
    .target('src/compiled/loader-utils2')
}
externals['loader-utils3'] = 'next/dist/compiled/loader-utils3'
export async function ncc_loader_utils3(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('loader-utils3')))
    .ncc({ packageName: 'loader-utils3', externals })
    .target('src/compiled/loader-utils3')
}
externals['lodash.curry'] = 'next/dist/compiled/lodash.curry'
export async function ncc_lodash_curry(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('lodash.curry')))
    .ncc({ packageName: 'lodash.curry', externals })
    .target('src/compiled/lodash.curry')
}
externals['lru-cache'] = 'next/dist/compiled/lru-cache'
export async function ncc_lru_cache(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('lru-cache')))
    .ncc({ packageName: 'lru-cache', externals })
    .target('src/compiled/lru-cache')
}
externals['nanoid'] = 'next/dist/compiled/nanoid'
export async function ncc_nanoid(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('nanoid')))
    .ncc({ packageName: 'nanoid', externals })
    .target('src/compiled/nanoid')
}
externals['native-url'] = 'next/dist/compiled/native-url'
export async function ncc_native_url(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('native-url')))
    .ncc({
      packageName: 'native-url',
      externals: {
        ...externals,
        querystring: 'next/dist/compiled/querystring-es3',
      },
      target: 'es5',
    })
    .target('src/compiled/native-url')
}
externals['neo-async'] = 'next/dist/compiled/neo-async'
export async function ncc_neo_async(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('neo-async')))
    .ncc({ packageName: 'neo-async', externals })
    .target('src/compiled/neo-async')
}

externals['ora'] = 'next/dist/compiled/ora'
export async function ncc_ora(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('ora')))
    .ncc({ packageName: 'ora', externals })
    .target('src/compiled/ora')
}
externals['postcss-flexbugs-fixes'] =
  'next/dist/compiled/postcss-flexbugs-fixes'
export async function ncc_postcss_flexbugs_fixes(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('postcss-flexbugs-fixes')))
    .ncc({ packageName: 'postcss-flexbugs-fixes', externals })
    .target('src/compiled/postcss-flexbugs-fixes')
}
export async function ncc_postcss_safe_parser(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('postcss-safe-parser')))
    .ncc({ packageName: 'postcss-safe-parser', externals })
    .target('src/compiled/postcss-safe-parser')
}
externals['postcss-preset-env'] = 'next/dist/compiled/postcss-preset-env'
export async function ncc_postcss_preset_env(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('postcss-preset-env')))
    .ncc({ packageName: 'postcss-preset-env', externals })
    .target('src/compiled/postcss-preset-env')
}
externals['postcss-scss'] = 'next/dist/compiled/postcss-scss'
export async function ncc_postcss_scss(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('postcss-scss')))
    .ncc({
      packageName: 'postcss-scss',
      externals: {
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('src/compiled/postcss-scss')
}
externals['postcss-modules-extract-imports'] =
  'next/dist/compiled/postcss-modules-extract-imports'
export async function ncc_postcss_modules_extract_imports(task, opts) {
  await task
    .source(
      relative(__dirname, require.resolve('postcss-modules-extract-imports'))
    )
    .ncc({
      packageName: 'postcss-modules-extract-imports',
      externals: {
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('src/compiled/postcss-modules-extract-imports')
}
externals['postcss-modules-local-by-default'] =
  'next/dist/compiled/postcss-modules-local-by-default'
export async function ncc_postcss_modules_local_by_default(task, opts) {
  await task
    .source(
      relative(__dirname, require.resolve('postcss-modules-local-by-default'))
    )
    .ncc({
      packageName: 'postcss-modules-local-by-default',
      externals: {
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('src/compiled/postcss-modules-local-by-default')
}
externals['postcss-modules-scope'] = 'next/dist/compiled/postcss-modules-scope'
export async function ncc_postcss_modules_scope(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('postcss-modules-scope')))
    .ncc({
      packageName: 'postcss-modules-scope',
      externals: {
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('src/compiled/postcss-modules-scope')
}
externals['postcss-modules-values'] =
  'next/dist/compiled/postcss-modules-values'
export async function ncc_postcss_modules_values(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('postcss-modules-values')))
    .ncc({
      packageName: 'postcss-modules-values',
      externals: {
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('src/compiled/postcss-modules-values')
}
externals['postcss-value-parser'] = 'next/dist/compiled/postcss-value-parser'
export async function ncc_postcss_value_parser(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('postcss-value-parser')))
    .ncc({
      packageName: 'postcss-value-parser',
      externals: {
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('src/compiled/postcss-value-parser')
}
externals['icss-utils'] = 'next/dist/compiled/icss-utils'
export async function ncc_icss_utils(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('icss-utils')))
    .ncc({
      packageName: 'icss-utils',
      externals: {
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('src/compiled/icss-utils')
}

externals['scheduler'] = 'next/dist/compiled/scheduler-experimental'
externals['scheduler'] = 'next/dist/compiled/scheduler'
export async function copy_vendor_react(task_) {
  function* copy_vendor_react_impl(task, opts) {
    const channel = opts.experimental ? `experimental-builtin` : `builtin`
    const packageSuffix = opts.experimental ? `-experimental` : ``

    // Override the `react`, `react-dom` and `scheduler`'s package names to avoid
    // "The name `react` was looked up in the Haste module map" warnings.
    // TODO-APP: remove unused fields from package.json and unused files
    function overridePackageName(source) {
      const json = JSON.parse(source)
      json.name = json.name + '-' + channel
      return JSON.stringify(
        {
          name: json.name,
          main: json.main,
          exports: json.exports,
          dependencies: json.dependencies,
          peerDependencies: json.peerDependencies,
          browser: json.browser,
        },
        null,
        2
      )
    }

    function aliasVendoredReactPackages(source) {
      return source
        .replace(
          /require\(["']react["']\)/g,
          `require("next/dist/compiled/react${packageSuffix}")`
        )
        .replace(
          /require\(["']react-dom["']\)/g,
          `require("next/dist/compiled/react-dom${packageSuffix}")`
        )
        .replace(
          /require\(["']scheduler["']\)/g,
          `require("next/dist/compiled/scheduler${packageSuffix}")`
        )
    }

    const schedulerDir = dirname(
      relative(__dirname, require.resolve(`scheduler-${channel}/package.json`))
    )
    yield task
      .source(join(schedulerDir, '*.{json,js}'))
      // eslint-disable-next-line require-yield
      .run({ every: true }, function* (file) {
        if (file.base === 'package.json') {
          file.data = overridePackageName(file.data.toString())
        }
      })
      .target(`src/compiled/scheduler${packageSuffix}`)
    yield task
      .source(join(schedulerDir, 'cjs/**/*.{js,map}'))
      .target(`src/compiled/scheduler${packageSuffix}/cjs`)
    yield task
      .source(join(schedulerDir, 'LICENSE'))
      .target(`src/compiled/scheduler${packageSuffix}`)

    const reactDir = dirname(
      relative(__dirname, require.resolve(`react-${channel}/package.json`))
    )
    const reactDomDir = dirname(
      relative(__dirname, require.resolve(`react-dom-${channel}/package.json`))
    )

    yield task
      .source(join(reactDir, '*.{json,js}'))
      // eslint-disable-next-line require-yield
      .run({ every: true }, function* (file) {
        if (file.base === 'package.json') {
          file.data = overridePackageName(file.data.toString())
        }
      })
      .target(`src/compiled/react${packageSuffix}`)
    yield task
      .source(join(reactDir, 'LICENSE'))
      .target(`src/compiled/react${packageSuffix}`)
    yield task
      .source(join(reactDir, 'cjs/**/*.{js,map}'))
      // eslint-disable-next-line require-yield
      .run({ every: true }, function* (file) {
        const source = file.data.toString()
        // We replace the module/chunk loading code with our own implementation in Next.js.
        file.data = aliasVendoredReactPackages(source)
      })
      .target(`src/compiled/react${packageSuffix}/cjs`)

    yield task
      .source(join(reactDomDir, '*.{json,js}'))
      // eslint-disable-next-line require-yield
      .run({ every: true }, function* (file) {
        if (file.base === 'package.json') {
          file.data = overridePackageName(file.data.toString())
        }
      })
      .target(`src/compiled/react-dom${packageSuffix}`)
    yield task
      .source(join(reactDomDir, 'LICENSE'))
      .target(`src/compiled/react-dom${packageSuffix}`)
    yield task
      .source(join(reactDomDir, 'cjs/**/*.{js,map}'))
      // eslint-disable-next-line require-yield
      .run({ every: true }, function* (file) {
        const source = file.data.toString()
        // We replace the module/chunk loading code with our own implementation in Next.js.
        let newSource = aliasVendoredReactPackages(source)

        file.data = newSource

        // Note that we don't replace `react-dom` with `next/dist/compiled/react-dom`
        // as it mighe be aliased to the server rendering stub.
      })
      .target(`src/compiled/react-dom${packageSuffix}/cjs`)

    function replaceIdentifiersInAst(
      /** @type {recast.types.namedTypes.File} */ ast,
      /** @type {Map<string, ExpressionKind>} */ replacements
    ) {
      recast.types.namedTypes.File.assert(ast)
      recast.visit(ast, {
        visitIdentifier(path) {
          const replacement = replacements.get(path.node.name)
          if (replacement !== undefined) {
            path.replace(replacement)
          }
          this.traverse(path)
        },
      })
    }

    function parseFile(
      /** @type {string} */ code,
      /** @type {recast.Options} */ opts
    ) {
      /** @type {recast.types.namedTypes.File} */
      const file = recast.parse(code, {
        parser: {
          parse(source, options) {
            return require('recast/parsers/acorn').parse(source, {
              ...options,
              // allow `import()` in `react-server-dom-{webpack,turbopack}-client.node.unbundled.development.js`
              ecmaVersion: 'latest',
              sourceType: 'script',
            })
          },
        },
        ...opts,
      })
      return file
    }

    /** @typedef {ReturnType<typeof parseExpression>} ExpressionKind */

    function parseExpression(/** @type {string} */ exprCode) {
      /** @type {recast.types.namedTypes.File} */
      const ast = recast.parse(`(${exprCode});`)
      const statement =
        /** @type {recast.types.namedTypes.ExpressionStatement} */ (
          ast.program.body[0]
        )
      return statement.expression
    }

    // Remove unused files
    const reactDomCompiledDir = join(
      __dirname,
      `src/compiled/react-dom${packageSuffix}`
    )
    const itemsToRemove = [
      'static.js',
      'static.browser.js',
      'unstable_testing.js',
      'test-utils.js',
      'server.bun.js',
      'cjs/react-dom-server.bun.development.js',
      'cjs/react-dom-server.bun.production.min.js',
      'cjs/react-dom-test-utils.development.js',
      'cjs/react-dom-test-utils.production.min.js',
      'unstable_server-external-runtime.js',
    ]
    for (const item of itemsToRemove) {
      yield rmrf(join(reactDomCompiledDir, item))
    }

    // react-server-dom-webpack
    // Currently, this `next` and `experimental` channels are always in sync so
    // we can use the same version for both.
    const reactServerDomWebpackDir = dirname(
      relative(
        __dirname,
        require.resolve(`react-server-dom-webpack${packageSuffix}/package.json`)
      )
    )
    yield task
      .source(join(reactServerDomWebpackDir, 'LICENSE'))
      .target(`src/compiled/react-server-dom-webpack${packageSuffix}`)
    yield task
      .source(
        join(reactServerDomWebpackDir, '{package.json,*.js,cjs/**/*.{js,map}}')
      )
      // eslint-disable-next-line require-yield
      .run({ every: true }, function* (file) {
        // We replace the module/chunk loading code with our own implementation in Next.js.
        // NOTE: We only replace module/chunk loading for server builds because the server
        // bundles have unique constraints like a runtime bundle. For browser builds this
        // package will be bundled alongside user code and we don't need to introduce the extra
        // indirection
        if (
          (file.base.startsWith('react-server-dom-webpack-client') &&
            !file.base.startsWith('react-server-dom-webpack-client.browser')) ||
          (file.base.startsWith('react-server-dom-webpack-server') &&
            !file.base.startsWith('react-server-dom-webpack-server.browser'))
        ) {
          const filepath = file.dir + '/' + file.base
          const source = file.data.toString()
          const ast = parseFile(source, { sourceFileName: filepath })
          replaceIdentifiersInAst(
            ast,
            new Map([
              [
                '__webpack_require__',
                parseExpression('globalThis.__next_require__'),
              ],
            ])
          )

          file.data = recast.print(ast).code
        } else if (file.base === 'package.json') {
          file.data = overridePackageName(file.data)
        }
      })
      .target(`src/compiled/react-server-dom-webpack${packageSuffix}`)

    // react-server-dom-turbopack
    // Currently, this `next` and `experimental` channels are always in sync so
    // we can use the same version for both.
    const reactServerDomTurbopackDir = dirname(
      relative(
        __dirname,
        require.resolve(
          `react-server-dom-turbopack${packageSuffix}/package.json`
        )
      )
    )
    yield task
      .source(join(reactServerDomTurbopackDir, 'LICENSE'))
      .target(`src/compiled/react-server-dom-turbopack${packageSuffix}`)
    yield task
      .source(
        join(
          reactServerDomTurbopackDir,
          '{package.json,*.js,cjs/**/*.{js,map}}'
        )
      )
      // eslint-disable-next-line require-yield
      .run({ every: true }, function* (file) {
        // We replace the module loading code with our own implementation in Next.js.
        // NOTE: We only replace module loading for server builds because the server
        // bundles have unique constraints like a runtime bundle. For browser builds this
        // package will be bundled alongside user code and we don't need to introduce the extra
        // indirection

        if (
          (file.base.startsWith('react-server-dom-turbopack-client') ||
            file.base.startsWith('react-server-dom-turbopack-server')) &&
          !file.base.includes('.browser.')
        ) {
          const source = file.data.toString()
          const filepath = file.dir + '/' + file.base
          const ast = parseFile(source, { sourceFileName: filepath })

          replaceIdentifiersInAst(
            ast,
            new Map([
              [
                '__turbopack_load_by_url__',
                parseExpression('globalThis.__next_chunk_load__'),
              ],
              [
                '__turbopack_require__',
                parseExpression('globalThis.__next_require__'),
              ],
            ])
          )

          file.data = recast.print(ast).code
        } else if (file.base === 'package.json') {
          file.data = overridePackageName(file.data)
        }
      })
      .target(`src/compiled/react-server-dom-turbopack${packageSuffix}`)
  }

  // As taskr transpiles async functions into generators, to reuse the same logic
  // we need to directly write this iteration logic here.
  for (const res of copy_vendor_react_impl(task_, { experimental: false })) {
    await res
  }
  for (const res of copy_vendor_react_impl(task_, { experimental: true })) {
    await res
  }

  // TODO: Support react-is experimental channel. We currently assume Canary and Experimental are equal.
  await task_
    .source(
      join(dirname(require.resolve('react-is-builtin/package.json')), '**/*')
    )
    .target('src/compiled/react-is')
}

export async function ncc_rsc_poison_packages(task, opts) {
  await task
    .source(join(dirname(require.resolve('server-only')), '*'))
    .target('src/compiled/server-only')
  await task
    .source(join(dirname(require.resolve('client-only')), '*'))
    .target('src/compiled/client-only')
}

externals['sass-loader'] = 'next/dist/compiled/sass-loader'
export async function ncc_sass_loader(task, opts) {
  const sassLoaderPath = require.resolve('sass-loader')
  const utilsPath = join(dirname(sassLoaderPath), 'utils.js')
  const originalContent = await fs.readFile(utilsPath, 'utf8')

  await fs.writeFile(
    utilsPath,
    originalContent.replace(
      /require\.resolve\(["'](sass|node-sass|sass-embedded)["']\)/g,
      'eval("require").resolve("$1")'
    )
  )

  await task
    .source(relative(__dirname, sassLoaderPath))
    .ncc({
      packageName: 'sass-loader',
      externals: {
        ...externals,
        'schema-utils': externals['schema-utils3'],
        'loader-utils': externals['loader-utils2'],
      },
      target: 'es5',
    })
    .target('src/compiled/sass-loader')
}
externals['schema-utils'] = 'MISSING_VERSION schema-utils version not specified'
externals['schema-utils2'] = 'next/dist/compiled/schema-utils2'
export async function ncc_schema_utils2(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('schema-utils2')))
    .ncc({
      packageName: 'schema-utils',
      bundleName: 'schema-utils2',
      externals,
    })
    .target('src/compiled/schema-utils2')
}
externals['schema-utils3'] = 'next/dist/compiled/schema-utils3'
export async function ncc_schema_utils3(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('schema-utils3')))
    .ncc({
      packageName: 'schema-utils',
      bundleName: 'schema-utils3',
      externals,
    })
    .target('src/compiled/schema-utils3')
}
externals['semver'] = 'next/dist/compiled/semver'
export async function ncc_semver(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('semver')))
    .ncc({ packageName: 'semver', externals })
    .target('src/compiled/semver')
}
externals['send'] = 'next/dist/compiled/send'
export async function ncc_send(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('send')))
    .ncc({ packageName: 'send', externals })
    .target('src/compiled/send')
}
// NB: Used by other dependencies, but Vercel version is a duplicate
// version so can be inlined anyway (although may change in future)
externals['source-map'] = 'next/dist/compiled/source-map'
export async function ncc_source_map(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('source-map')))
    .ncc({ packageName: 'source-map', externals })
    .target('src/compiled/source-map')
}
// NB: Used by other dependencies, but Vercel version is a duplicate
// version so can be inlined anyway (although may change in future)
externals['source-map08'] = 'next/dist/compiled/source-map08'
externals['next/dist/compiled/source-map08'] = 'next/dist/compiled/source-map08'
export async function ncc_source_map08(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('source-map08')))
    .ncc({
      packageName: 'source-map08',
      packageJsonName: 'source-map08',
      externals,
      minify: false,
    })
    .target('src/compiled/source-map08')
}
externals['string-hash'] = 'next/dist/compiled/string-hash'
export async function ncc_string_hash(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('string-hash')))
    .ncc({ packageName: 'string-hash', externals })
    .target('src/compiled/string-hash')
}
externals['strip-ansi'] = 'next/dist/compiled/strip-ansi'
externals['next/dist/compiled/strip-ansi'] = 'next/dist/compiled/strip-ansi'
export async function ncc_strip_ansi(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('strip-ansi')))
    .ncc({ packageName: 'strip-ansi', externals })
    .target('src/compiled/strip-ansi')
}
externals['@vercel/nft'] = 'next/dist/compiled/@vercel/nft'
export async function ncc_nft(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('@vercel/nft')))
    .ncc({ packageName: '@vercel/nft', externals })
    .target('src/compiled/@vercel/nft')
}

externals['tar'] = 'next/dist/compiled/tar'
export async function ncc_tar(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('tar')))
    .ncc({ packageName: 'tar', externals })
    .target('src/compiled/tar')
}

externals['terser'] = 'next/dist/compiled/terser'
export async function ncc_terser(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('terser')))
    .ncc({ packageName: 'terser', externals })
    .target('src/compiled/terser')
}
externals['text-table'] = 'next/dist/compiled/text-table'
export async function ncc_text_table(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('text-table')))
    .ncc({ packageName: 'text-table', externals })
    .target('src/compiled/text-table')
}
externals['unistore'] = 'next/dist/compiled/unistore'
export async function ncc_unistore(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('unistore')))
    .ncc({ packageName: 'unistore', externals })
    .target('src/compiled/unistore')
}

externals['superstruct'] = 'next/dist/compiled/superstruct'
export async function ncc_superstruct(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('superstruct')))
    .ncc({ packageName: 'superstruct', externals })
    .target('src/compiled/superstruct')
}

externals['zod'] = 'next/dist/compiled/zod'
export async function ncc_zod(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('zod')))
    .ncc({ packageName: 'zod', externals })
    .target('src/compiled/zod')
}

externals['zod-validation-error'] = 'next/dist/compiled/zod-validation-error'
export async function ncc_zod_validation_error(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('zod-validation-error')))
    .ncc({ packageName: 'zod-validation-error', externals })
    .target('src/compiled/zod-validation-error')
}

externals['web-vitals'] = 'next/dist/compiled/web-vitals'
export async function ncc_web_vitals(task, opts) {
  await task
    .source(
      relative(
        __dirname,
        resolve(resolveFrom(__dirname, 'web-vitals'), '../web-vitals.js')
      )
    )
    // web-vitals@3.0.0 is pure ESM, compile to CJS for pre-compiled
    .ncc({ packageName: 'web-vitals', externals, target: 'es5', esm: false })
    .target('src/compiled/web-vitals')
}
externals['web-vitals-attribution'] =
  'next/dist/compiled/web-vitals-attribution'
export async function ncc_web_vitals_attribution(task, opts) {
  await task
    .source(
      relative(
        __dirname,
        resolve(require.resolve('web-vitals'), '../web-vitals.attribution.js')
      )
    )
    .ncc({
      packageName: 'web-vitals',
      bundleName: 'web-vitals-attribution',
      externals,
      target: 'es5',
      esm: false,
    })
    .target('src/compiled/web-vitals-attribution')
}
externals['webpack-sources'] = 'error webpack-sources version not specified'
externals['webpack-sources1'] = 'next/dist/compiled/webpack-sources1'
export async function ncc_webpack_sources1(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('webpack-sources1')))
    .ncc({ packageName: 'webpack-sources1', externals, target: 'es5' })
    .target('src/compiled/webpack-sources1')
}
externals['webpack-sources3'] = 'next/dist/compiled/webpack-sources3'
export async function ncc_webpack_sources3(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('webpack-sources3')))
    .ncc({ packageName: 'webpack-sources3', externals, target: 'es5' })
    .target('src/compiled/webpack-sources3')
}

externals['picomatch'] = 'next/dist/compiled/picomatch'
export async function ncc_minimatch(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('picomatch')))
    .ncc({ packageName: 'picomatch', externals })
    .target('src/compiled/picomatch')
}

externals['mini-css-extract-plugin'] =
  'next/dist/compiled/mini-css-extract-plugin'

export async function ncc_mini_css_extract_plugin(task, opts) {
  await task
    .source(
      relative(
        __dirname,
        resolve(require.resolve('mini-css-extract-plugin'), '../index.js')
      )
    )
    .ncc({
      externals: {
        ...externals,
        './index': './index.js',
        'schema-utils': externals['schema-utils3'],
        'webpack-sources': externals['webpack-sources1'],
      },
    })
    .target('src/compiled/mini-css-extract-plugin')
  await task
    .source(
      relative(
        __dirname,
        resolve(
          require.resolve('mini-css-extract-plugin'),
          '../hmr/hotModuleReplacement.js'
        )
      )
    )
    .ncc({
      externals: {
        ...externals,
        './hmr': './hmr',
        'schema-utils': 'next/dist/compiled/schema-utils3',
      },
    })
    .target('src/compiled/mini-css-extract-plugin/hmr')
  await task
    .source(relative(__dirname, require.resolve('mini-css-extract-plugin')))
    .ncc({
      packageName: 'mini-css-extract-plugin',
      externals: {
        ...externals,
        './index': './index.js',
        'schema-utils': externals['schema-utils3'],
      },
    })
    .target('src/compiled/mini-css-extract-plugin')
}

externals['ua-parser-js'] = 'next/dist/compiled/ua-parser-js'
export async function ncc_ua_parser_js(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('ua-parser-js')))
    .ncc({ packageName: 'ua-parser-js', externals })
    .target('src/compiled/ua-parser-js')
}
export async function ncc_webpack_bundle5(task, opts) {
  const bundleExternals = {
    ...externals,
    'schema-utils': externals['schema-utils3'],
    'webpack-sources': externals['webpack-sources3'],
  }
  for (const pkg of Object.keys(webpackBundlePackages)) {
    delete bundleExternals[pkg]
  }
  await task
    .source('src/bundles/webpack/bundle5.js')
    .ncc({
      packageName: 'webpack',
      bundleName: 'webpack',
      customEmit(path) {
        if (path.endsWith('.runtime.js')) return `'./${basename(path)}'`
      },
      externals: bundleExternals,
      target: 'es5',
    })
    .target('src/compiled/webpack')
}

const webpackBundlePackages = {
  webpack: 'next/dist/compiled/webpack/webpack-lib',
  'webpack/lib/NormalModule': 'next/dist/compiled/webpack/NormalModule',
  'webpack/lib/node/NodeTargetPlugin':
    'next/dist/compiled/webpack/NodeTargetPlugin',
}

Object.assign(externals, webpackBundlePackages)

export async function ncc_webpack_bundle_packages(task, opts) {
  await task
    .source('src/bundles/webpack/packages/*')
    .target('src/compiled/webpack/')
}

externals['ws'] = 'next/dist/compiled/ws'
export async function ncc_ws(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('ws')))
    .ncc({ packageName: 'ws', externals })
    .target('src/compiled/ws')
}

export async function ncc_modelcontextprotocol_sdk(task, opts) {
  await task
    .source(
      relative(
        __dirname,
        require.resolve('@modelcontextprotocol/sdk/server/mcp.js')
      )
    )
    .ncc({
      externals,
    })
    .target('src/compiled/@modelcontextprotocol/sdk/server')
  await task
    .source(
      relative(
        __dirname,
        require.resolve('@modelcontextprotocol/sdk/server/streamableHttp.js')
      )
    )
    .ncc({
      externals,
    })
    .target('src/compiled/@modelcontextprotocol/sdk/server')
}

externals['path-to-regexp'] = 'next/dist/compiled/path-to-regexp'
export async function ncc_path_to_regexp(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('path-to-regexp')))
    .ncc({ packageName: 'path-to-regexp', externals })
    .target('src/compiled/path-to-regexp')
}

externals['@opentelemetry/api'] = 'next/dist/compiled/@opentelemetry/api'
export async function ncc_opentelemetry_api(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('@opentelemetry/api'))
    )
    .ncc({ packageName: '@opentelemetry/api', externals })
    .target('src/compiled/@opentelemetry/api')
}

externals['http-proxy-agent'] = 'next/dist/compiled/http-proxy-agent'
export async function ncc_http_proxy_agent(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('http-proxy-agent')))
    .ncc({ packageName: 'http-proxy-agent', externals })
    .target('src/compiled/http-proxy-agent')
}

externals['https-proxy-agent'] = 'next/dist/compiled/https-proxy-agent'
export async function ncc_https_proxy_agent(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('https-proxy-agent')))
    .ncc({ packageName: 'https-proxy-agent', externals })
    .target('src/compiled/https-proxy-agent')
}

externals['safe-stable-stringify'] = 'next/dist/compiled/safe-stable-stringify'
export async function ncc_safe_stable_stringify(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('safe-stable-stringify')))
    .ncc({
      packageName: 'safe-stable-stringify',
      externals,
      target: 'es5',
    })
    .target('src/compiled/safe-stable-stringify')
}

export async function precompile(task, opts) {
  await task.parallel(
    ['browser_polyfills', 'copy_ncced', 'copy_styled_jsx_assets'],
    opts
  )
}

export async function copy_ncced(task) {
  // we don't ncc every time we build since these won't change
  // that often and can be committed to the repo saving build time
  await task.source('src/compiled/**/*').target('dist/compiled')
}

export async function ncc(task, opts) {
  await task
    .clear('src/compiled')
    .parallel(
      [
        'ncc_safe_stable_stringify',
        'ncc_node_html_parser',
        'ncc_napirs_triples',
        'ncc_p_limit',
        'ncc_p_queue',
        'ncc_raw_body',
        'ncc_image_size',
        'ncc_image_detector',
        'ncc_hapi_accept',
        'ncc_commander',
        'ncc_node_anser',
        'ncc_node_stacktrace_parser',
        'ncc_node_data_uri_to_buffer',
        'ncc_node_cssescape',
        'ncc_node_shell_quote',
        'ncc_acorn',
        'ncc_async_retry',
        'ncc_async_sema',
        'ncc_postcss_plugin_stub_for_cssnano_simple',
        'ncc_assert',
        'ncc_browser_zlib',
        'ncc_buffer',
        'ncc_crypto_browserify',
        'ncc_domain_browser',
        'ncc_events',
        'ncc_stream_browserify',
        'ncc_stream_http',
        'ncc_https_browserify',
        'ncc_os_browserify',
        'ncc_path_browserify',
        'ncc_process',
        'ncc_querystring_es3',
        'ncc_string_decoder',
        'ncc_util',
        'ncc_punycode',
        'ncc_set_immediate',
        'ncc_timers_browserify',
        'ncc_tty_browserify',
        'ncc_vm_browserify',
        'ncc_babel_bundle',
        'ncc_babel_code_frame',
        'ncc_bytes',
        'ncc_ci_info',
        'ncc_cli_select',
        'ncc_comment_json',
        'ncc_compression',
        'ncc_conf',
        'ncc_content_disposition',
        'ncc_content_type',
        'ncc_cookie',
        'ncc_cross_spawn',
        'ncc_debug',
        'ncc_devalue',
        'ncc_find_up',
        'ncc_fresh',
        'ncc_glob',
        'ncc_gzip_size',
        'ncc_http_proxy',
        'ncc_ignore_loader',
        'ncc_is_animated',
        'ncc_is_local_address',
        'ncc_is_docker',
        'ncc_is_wsl',
        'ncc_json5',
        'ncc_jsonwebtoken',
        'ncc_loader_runner',
        'ncc_loader_utils2',
        'ncc_loader_utils3',
        'ncc_lodash_curry',
        'ncc_lru_cache',
        'ncc_nanoid',
        'ncc_native_url',
        'ncc_neo_async',
        'ncc_ora',
        'ncc_path_to_regexp',
        'ncc_postcss_safe_parser',
        'ncc_postcss_flexbugs_fixes',
        'ncc_postcss_preset_env',
        'ncc_postcss_scss',
        'ncc_postcss_modules_extract_imports',
        'ncc_postcss_modules_local_by_default',
        'ncc_postcss_modules_scope',
        'ncc_postcss_modules_values',
        'ncc_postcss_value_parser',
        'ncc_icss_utils',
        'ncc_schema_utils2',
        'ncc_schema_utils3',
        'ncc_semver',
        'ncc_send',
        'ncc_source_map',
        'ncc_source_map08',
        'ncc_string_hash',
        'ncc_strip_ansi',
        'ncc_superstruct',
        'ncc_zod',
        'ncc_zod_validation_error',
        'ncc_nft',
        'ncc_tar',
        'ncc_terser',
        'ncc_text_table',
        'ncc_unistore',
        'ncc_watchpack',
        'ncc_web_vitals',
        'ncc_web_vitals_attribution',
        'ncc_webpack_bundle5',
        'ncc_webpack_sources1',
        'ncc_webpack_sources3',
        'ncc_ws',
        'ncc_ua_parser_js',
        'ncc_minimatch',
        'ncc_opentelemetry_api',
        'ncc_http_proxy_agent',
        'ncc_https_proxy_agent',
        'ncc_mini_css_extract_plugin',
      ],
      opts
    )
  await task.parallel(['ncc_webpack_bundle_packages'], opts)
  await task.parallel(['ncc_babel_bundle_packages'], opts)
  await task.serial(
    [
      'ncc_browserslist',
      'ncc_cssnano_simple_bundle',
      'copy_regenerator_runtime',
      'copy_babel_runtime',
      'copy_vercel_og',
      'copy_constants_browserify',
      'copy_vendor_react',
      'ncc_sass_loader',
      'ncc_jest_worker',
      'ncc_edge_runtime_cookies',
      'ncc_edge_runtime_primitives',
      'ncc_edge_runtime_ponyfill',
      'ncc_edge_runtime',
      'ncc_busboy',
      'ncc_mswjs_interceptors',
      'ncc_rsc_poison_packages',
      'ncc_modelcontextprotocol_sdk',
    ],
    opts
  )
}

export async function next_compile(task, opts) {
  await task.parallel(
    [
      'cli',
      'bin',
      'server',
      'server_esm',
      'api_esm',
      'nextbuild',
      'nextbuildjest',
      'nextbuildstatic',
      'nextbuildstatic_esm',
      'nextbuild_esm',
      'next_devtools_entrypoint',
      'next_devtools_server',
      'next_devtools_server_esm',
      'next_devtools_shared',
      'next_devtools_shared_esm',
      'next_devtools_userspace',
      'next_devtools_userspace_esm',
      'pages',
      'pages_esm',
      'lib',
      'lib_esm',
      'client',
      'client_esm',
      'diagnostics',
      'telemetry',
      'trace',
      'shared',
      'shared_esm',
      'shared_re_exported',
      'shared_re_exported_esm',
      'server_wasm',
      'experimental_testing',
      'experimental_testmode',
    ],
    opts
  )
}

export async function compile(task, opts) {
  await task.serial(['next_compile', 'next_bundle'], opts)

  await task.serial([
    'ncc_react_refresh_utils',
    'ncc_next_font',
    'capsize_metrics',
  ])
}

export async function bin(task, opts) {
  await task
    .source('src/bin/*')
    .swc('server', { stripExtension: true, dev: opts.dev })
    .target('dist/bin', { mode: '0755' })
}

export async function cli(task, opts) {
  await task
    .source('src/cli/**/*.+(js|ts|tsx)')
    .swc('server', { dev: opts.dev })
    .target('dist/cli')
}

export async function lib(task, opts) {
  await task
    .source('src/lib/**/!(*.test).+(js|ts|tsx|json)')
    .swc('server', { dev: opts.dev })
    .target('dist/lib')
}

export async function lib_esm(task, opts) {
  await task
    .source('src/lib/**/!(*.test).+(js|ts|tsx|json)')
    .swc('server', { dev: opts.dev, esm: true })
    .target('dist/esm/lib')
}

export async function server(task, opts) {
  await task
    .source('src/server/**/!(*.test).+(js|ts|tsx)')
    .swc('server', { dev: opts.dev })
    .target('dist/server')
}

export async function server_esm(task, opts) {
  await task
    .source('src/server/**/!(*.test).+(js|mts|ts|tsx)')
    .swc('server', { dev: opts.dev, esm: true })
    .target('dist/esm/server')
}

// Provide ESM entry files for Next.js apis,
// Remain in ESM both for dist/ and dist/esm
export async function api_esm(task, opts) {
  await task
    .source('src/api/**/*.+(js|mts|ts|tsx)')
    .swc('server', { dev: opts.dev, esm: true })
    .target('dist/api')
    .target('dist/esm/api')
}

export async function nextbuild(task, opts) {
  await task
    .source('src/build/**/*.+(js|ts|tsx)', {
      ignore: [
        '**/fixture/**',
        '**/tests/**',
        '**/jest/**',
        '**/*.test.d.ts',
        '**/*.test.+(js|ts|tsx)',
      ],
    })
    .swc('server', { dev: opts.dev })
    .target('dist/build')
}

export async function nextbuild_esm(task, opts) {
  await task
    .source('src/build/**/*.+(js|ts|tsx)', {
      ignore: [
        '**/fixture/**',
        '**/tests/**',
        '**/jest/**',
        '**/*.test.d.ts',
        '**/*.test.+(js|ts|tsx)',
      ],
    })
    .swc('server', { dev: opts.dev, esm: true })
    .target('dist/esm/build')
}

export async function nextbuildjest(task, opts) {
  await task
    .source('src/build/jest/**/*.+(js|ts|tsx)', {
      ignore: [
        '**/fixture/**',
        '**/tests/**',
        '**/*.test.d.ts',
        '**/*.test.+(js|ts|tsx)',
      ],
    })
    .swc('server', { dev: opts.dev, interopClientDefaultExport: true })
    .target('dist/build/jest')
}

export async function client(task, opts) {
  await task
    .source('src/client/**/!(*.test|*.stories).+(js|ts|tsx|woff2)')
    .swc('client', { dev: opts.dev, interopClientDefaultExport: true })
    .target('dist/client')
}

export async function client_esm(task, opts) {
  await task
    .source('src/client/**/!(*.test|*.stories).+(js|ts|tsx|woff2)')
    .swc('client', { dev: opts.dev, esm: true })
    .target('dist/esm/client')
}

export async function next_devtools_entrypoint(task, opts) {
  await task
    .source('src/next-devtools/dev-overlay.shim.ts')
    .swc('client', { dev: opts.dev, interopClientDefaultExport: true })
    .target('dist/next-devtools')
}

export async function next_devtools_server(task, opts) {
  await task
    .source(
      'src/next-devtools/server/**/!(*.test|*.stories).+(js|ts|tsx|woff2)'
    )
    .swc('client', { dev: opts.dev, interopClientDefaultExport: true })
    .target('dist/next-devtools/server')
}

export async function next_devtools_server_esm(task, opts) {
  await task
    .source(
      'src/next-devtools/server/**/!(*.test|*.stories).+(js|ts|tsx|woff2)'
    )
    .swc('client', { dev: opts.dev, esm: true })
    .target('dist/esm/next-devtools/server')
}

export async function next_devtools_shared(task, opts) {
  await task
    .source(
      'src/next-devtools/shared/**/!(*.test|*.stories).+(js|ts|tsx|woff2)'
    )
    .swc('client', { dev: opts.dev, interopClientDefaultExport: true })
    .target('dist/next-devtools/shared')
}

export async function next_devtools_shared_esm(task, opts) {
  await task
    .source(
      'src/next-devtools/shared/**/!(*.test|*.stories).+(js|ts|tsx|woff2)'
    )
    .swc('client', { dev: opts.dev, esm: true })
    .target('dist/esm/next-devtools/shared')
}

export async function next_devtools_userspace(task, opts) {
  await task
    .source(
      'src/next-devtools/userspace/**/!(*.test|*.stories).+(js|ts|tsx|woff2)'
    )
    .swc('client', { dev: opts.dev, interopClientDefaultExport: true })
    .target('dist/next-devtools/userspace')
}

export async function next_devtools_userspace_esm(task, opts) {
  await task
    .source(
      'src/next-devtools/userspace/**/!(*.test|*.stories).+(js|ts|tsx|woff2)'
    )
    .swc('client', { dev: opts.dev, esm: true })
    .target('dist/esm/next-devtools/userspace')
}

// export is a reserved keyword for functions
export async function nextbuildstatic(task, opts) {
  await task
    .source('src/export/**/!(*.test).+(js|ts|tsx)')
    .swc('server', { dev: opts.dev })
    .target('dist/export')
}

// export is a reserved keyword for functions
export async function nextbuildstatic_esm(task, opts) {
  await task
    .source('src/export/**/!(*.test).+(js|ts|tsx)')
    .swc('server', { dev: opts.dev, esm: true })
    .target('dist/esm/export')
}

export async function pages_app(task, opts) {
  await task
    .source('src/pages/_app.tsx')
    .swc('client', {
      dev: opts.dev,
      interopClientDefaultExport: true,
    })
    .target('dist/pages')
}

export async function pages_error(task, opts) {
  await task
    .source('src/pages/_error.tsx')
    .swc('client', {
      dev: opts.dev,
      interopClientDefaultExport: true,
    })
    .target('dist/pages')
}

export async function pages_document(task, opts) {
  await task
    .source('src/pages/_document.tsx')
    .swc('server', {
      dev: opts.dev,
    })
    .target('dist/pages')
}

export async function pages_app_esm(task, opts) {
  await task
    .source('src/pages/_app.tsx')
    .swc('client', {
      dev: opts.dev,
      esm: true,
    })
    .target('dist/esm/pages')
}

export async function pages_error_esm(task, opts) {
  await task
    .source('src/pages/_error.tsx')
    .swc('client', {
      dev: opts.dev,
      esm: true,
    })
    .target('dist/esm/pages')
}

export async function pages_document_esm(task, opts) {
  await task
    .source('src/pages/_document.tsx')
    .swc('server', {
      dev: opts.dev,
      esm: true,
    })
    .target('dist/esm/pages')
}

export async function pages(task, opts) {
  await task.parallel(['pages_app', 'pages_error', 'pages_document'], opts)
}

export async function pages_esm(task, opts) {
  await task.parallel(
    ['pages_app_esm', 'pages_error_esm', 'pages_document_esm'],
    opts
  )
}

export async function telemetry(task, opts) {
  await task
    .source('src/telemetry/**/*.+(js|ts|tsx)')
    .swc('server', { dev: opts.dev })
    .target('dist/telemetry')
}

export async function trace(task, opts) {
  await task
    .source('src/trace/**/*.+(js|ts|tsx)')
    .swc('server', { dev: opts.dev })
    .target('dist/trace')
}

export async function diagnostics(task, opts) {
  await task
    .source('src/diagnostics/**/*.+(js|ts|tsx)')
    .swc('server', { dev: opts.dev })
    .target('dist/diagnostics')
}

export async function build(task, opts) {
  await task.serial(
    ['precompile', 'compile', 'check_error_codes', 'generate_types'],
    opts
  )
}

export async function generate_types(task, opts) {
  const watchmode = opts.dev
  const typesPromise = execa(
    'pnpm',
    [
      'run',
      'types',
      ...(watchmode ? ['--watch', '--preserveWatchOutput'] : []),
    ],
    { stdio: 'inherit' }
  )
  // In watch-mode the process never completes i.e. the Promise never resolve.
  // But taskr needs to know that it can start watching the files for the task it has to manually restart.
  if (!watchmode) {
    await typesPromise
  }
}

export async function check_error_codes(task, opts) {
  try {
    await execa.command('pnpm -w run check-error-codes', {
      stdio: 'inherit',
    })
  } catch (err) {
    if (process.env.CI) {
      await execa.command(
        'echo check_error_codes FAILED: There are new errors introduced but no corresponding error codes are found in errors.json file, so make sure you run `pnpm build` or `pnpm update-error-codes` and then commit the change in errors.json.',
        {
          stdio: 'inherit',
        }
      )
      process.exit(1)
    }
    await task.start('compile', opts)
  }
}

export default async function (task) {
  const opts = { dev: true }
  await task.clear('dist')
  await task.start('build', opts)
  await task.watch('src/bin', 'bin', opts)
  await task.watch('src/pages', 'pages', opts)
  await task.watch('src/server', ['server', 'server_esm', 'server_wasm'], opts)
  await task.watch('src/api', 'api_esm', opts)
  await task.watch(
    'src/build',
    ['nextbuild', 'nextbuild_esm', 'nextbuildjest'],
    opts
  )
  await task.watch(
    'src/next-devtools',
    [
      'next_devtools_entrypoint',
      'next_devtools_server',
      'next_devtools_server_esm',
      'next_devtools_shared',
      'next_devtools_shared_esm',
      'next_devtools_userspace',
      'next_devtools_userspace_esm',
    ],
    opts
  )
  await task.watch('src/experimental/testing', 'experimental_testing', opts)
  await task.watch('src/experimental/testmode', 'experimental_testmode', opts)
  await task.watch('src/export', 'nextbuildstatic', opts)
  await task.watch('src/export', 'nextbuildstatic_esm', opts)
  await task.watch('src/client', 'client', opts)
  await task.watch('src/client', 'client_esm', opts)
  await task.watch('src/diagnostics', 'diagnostics', opts)
  await task.watch('src/lib', 'lib', opts)
  await task.watch('src/lib', 'lib_esm', opts)
  await task.watch('src/cli', 'cli', opts)
  await task.watch('src/telemetry', 'telemetry', opts)
  await task.watch('src/trace', 'trace', opts)
  await task.watch(
    'src/shared',
    ['shared_re_exported', 'shared_re_exported_esm', 'shared', 'shared_esm'],
    opts
  )
}

export async function shared(task, opts) {
  await task
    .source('src/shared/**/*.+(js|ts|tsx)', {
      ignore: [
        'src/shared/**/{config,constants,dynamic,app-dynamic,head,runtime-config}.+(js|ts|tsx)',
        '**/*.test.d.ts',
        '**/*.test.+(js|ts|tsx)',
      ],
    })
    .swc('client', { dev: opts.dev })
    .target('dist/shared')
}

export async function shared_esm(task, opts) {
  await task
    .source('src/shared/**/*.+(js|ts|tsx)', {
      ignore: [
        'src/shared/**/{config,constants,dynamic,app-dynamic,head,runtime-config}.+(js|ts|tsx)',
        '**/*.test.d.ts',
        '**/*.test.+(js|ts|tsx)',
      ],
    })
    .swc('client', { dev: opts.dev, esm: true })
    .target('dist/esm/shared')
}

export async function shared_re_exported(task, opts) {
  await task
    .source(
      'src/shared/**/{config,constants,dynamic,app-dynamic,head,runtime-config}.+(js|ts|tsx)',
      {
        ignore: ['**/*.test.d.ts', '**/*.test.+(js|ts|tsx)'],
      }
    )
    .swc('client', { dev: opts.dev, interopClientDefaultExport: true })
    .target('dist/shared')
}

export async function shared_re_exported_esm(task, opts) {
  await task
    .source(
      'src/shared/**/{config,constants,app-dynamic,dynamic,head}.+(js|ts|tsx)',
      {
        ignore: ['**/*.test.d.ts', '**/*.test.+(js|ts|tsx)'],
      }
    )
    .swc('client', {
      dev: opts.dev,
      esm: true,
    })
    .target('dist/esm/shared')
}

export async function server_wasm(task, opts) {
  await task.source('src/server/**/*.+(wasm)').target('dist/server')
}

export async function experimental_testing(task, opts) {
  await task
    .source('src/experimental/testing/**/!(*.test).+(js|ts|tsx)')
    .swc('server', {
      dev: opts.dev,
    })
    .target('dist/experimental/testing')
}

export async function experimental_testmode(task, opts) {
  await task
    .source('src/experimental/testmode/**/!(*.test).+(js|ts|tsx)')
    .swc('server', {
      dev: opts.dev,
    })
    .target('dist/experimental/testmode')
}

export async function release(task) {
  await task.clear('dist').start('build')
}

export async function next_bundle_app_prod_turbo(task, opts) {
  await task.source('dist').webpack({
    watch: opts.dev,
    config: require('./next-runtime.webpack-config')({
      turbo: true,
      bundleType: 'app',
    }),
    name: 'next-bundle-app-prod-turbo',
  })
}

export async function next_bundle_app_prod(task, opts) {
  await task.source('dist').webpack({
    watch: opts.dev,
    config: require('./next-runtime.webpack-config')({
      dev: false,
      bundleType: 'app',
    }),
    name: 'next-bundle-app-prod',
  })
}

export async function next_bundle_app_dev_turbo(task, opts) {
  await task.source('dist').webpack({
    watch: opts.dev,
    config: require('./next-runtime.webpack-config')({
      turbo: true,
      dev: true,
      bundleType: 'app',
    }),
    name: 'next-bundle-app-dev-turbo',
  })
}

export async function next_bundle_app_dev(task, opts) {
  await task.source('dist').webpack({
    watch: opts.dev,
    config: require('./next-runtime.webpack-config')({
      dev: true,
      bundleType: 'app',
    }),
    name: 'next-bundle-app-dev',
  })
}

export async function next_bundle_app_prod_turbo_experimental(task, opts) {
  await task.source('dist').webpack({
    watch: opts.dev,
    config: require('./next-runtime.webpack-config')({
      turbo: true,
      bundleType: 'app',
      experimental: true,
    }),
    name: 'next-bundle-app-prod-turbo-experimental',
  })
}

export async function next_bundle_app_prod_experimental(task, opts) {
  await task.source('dist').webpack({
    watch: opts.dev,
    config: require('./next-runtime.webpack-config')({
      dev: false,
      bundleType: 'app',
      experimental: true,
    }),
    name: 'next-bundle-app-prod-experimental',
  })
}

export async function next_bundle_app_dev_turbo_experimental(task, opts) {
  await task.source('dist').webpack({
    watch: opts.dev,
    config: require('./next-runtime.webpack-config')({
      turbo: true,
      dev: true,
      bundleType: 'app',
      experimental: true,
    }),
    name: 'next-bundle-app-dev-turbo-experimental',
  })
}

export async function next_bundle_app_dev_experimental(task, opts) {
  await task.source('dist').webpack({
    watch: opts.dev,
    config: require('./next-runtime.webpack-config')({
      dev: true,
      bundleType: 'app',
      experimental: true,
    }),
    name: 'next-bundle-app-dev-experimental',
  })
}

export async function next_bundle_pages_prod(task, opts) {
  await task.source('dist').webpack({
    watch: opts.dev,
    config: require('./next-runtime.webpack-config')({
      dev: false,
      bundleType: 'pages',
    }),
    name: 'next-bundle-pages-prod',
  })
}

export async function next_bundle_pages_dev(task, opts) {
  await task.source('dist').webpack({
    watch: opts.dev,
    config: require('./next-runtime.webpack-config')({
      dev: true,
      bundleType: 'pages',
    }),
    name: 'next-bundle-pages-dev',
  })
}

export async function next_bundle_pages_prod_turbo(task, opts) {
  await task.source('dist').webpack({
    watch: opts.dev,
    config: require('./next-runtime.webpack-config')({
      turbo: true,
      bundleType: 'pages',
    }),
    name: 'next-bundle-pages-prod-turbo',
  })
}

export async function next_bundle_pages_dev_turbo(task, opts) {
  await task.source('dist').webpack({
    watch: opts.dev,
    config: require('./next-runtime.webpack-config')({
      turbo: true,
      dev: true,
      bundleType: 'pages',
    }),
    name: 'next-bundle-pages-dev-turbo',
  })
}

export async function next_bundle_server(task, opts) {
  await task.source('dist').webpack({
    watch: opts.dev,
    config: require('./next-runtime.webpack-config')({
      dev: false,
      bundleType: 'server',
    }),
    name: 'next-bundle-server',
  })
}

export async function next_bundle_devtools(task, opts) {
  await task.source('dist').webpack({
    watch: opts.dev,
    config: require('./next-devtools.webpack-config')({
      dev: opts.dev,
    }),
    name: 'next-bundle-devtools-dev',
  })
}

export async function next_bundle(task, opts) {
  await task.parallel(
    [
      // builds the app (route/page) bundles
      'next_bundle_app_prod_turbo',
      'next_bundle_app_prod',
      'next_bundle_app_dev_turbo',
      'next_bundle_app_dev',
      // builds the app (route/page) bundles with react experimental
      'next_bundle_app_prod_turbo_experimental',
      'next_bundle_app_prod_experimental',
      'next_bundle_app_dev_turbo_experimental',
      'next_bundle_app_dev_experimental',
      // builds the pages (page/api) bundles
      'next_bundle_pages_prod',
      'next_bundle_pages_dev',
      'next_bundle_pages_prod_turbo',
      'next_bundle_pages_dev_turbo',
      // builds the minimal server
      'next_bundle_server',
      // devtools
      'next_bundle_devtools',
    ],
    opts
  )
}

function writeJson(file, obj, { spaces = 0 } = {}) {
  return fs.writeFile(
    file,
    JSON.stringify(obj, null, spaces) + (spaces === 0 ? '\n' : '')
  )
}

function rmrf(path, options) {
  return fs.rm(path, { recursive: true, force: true, ...options })
}

function readJson(path) {
  return fs.readFile(path, 'utf8').then((content) => JSON.parse(content))
}
