// TODO: Turbopack should own this. Building the bundles with the same bundler as
// the app's build would remove the second bundler.
//
// The native RSC runtime's precompile: one Rspack build per bundle, that is, per
// output entry and bundle type. Each build:
//
// - resolves each fork alias (`#<name>`, from `FORKS`) to the bundle type's fork, so
//   the other forks and the modules only they import stay out;
// - leaves `EXTERNALS` and builtins as imports;
// - writes ESM, unminified, with a source map.

const fs = require('fs')
const path = require('path')
const { builtinModules } = require('module')
const rspack = require('@rspack/core')

// The bundles, declared once. Each output builds its entries once per bundle type,
// and a bundle type picks one value per axis. A bundle (one entry, one bundle type) is
// written to `dist/native-rsc-runtime/<entry>.<axis values, in AXES order>.js`.
//
// React's channel isn't an axis: React stays external, and the app's build resolves
// it.
const AXES = {
  engine: ['node'],
  mode: ['prod'],
}

const OUTPUTS = {
  renderer: {
    // Entry name (the first part of each file name) to its source, relative to the
    // source tree.
    entries: { rsc: 'entries/rsc.ts', ssr: 'entries/ssr.ts' },
    bundleTypes: [{ engine: 'node', mode: 'prod' }],
  },
}

// The fork sets, by name, and the axis each varies on. A fork set `<name>` is imported
// as `#<name>` and has one file per value of its axis, `forks/<name>.<value>.ts`, next
// to its generic type, `forks/<name>.d.ts`. The precompile fails on an incomplete fork
// set or a stray fork.
const FORKS = {
  'engine-config': 'engine',
}

// The reviewed list of a bundle's externals: modules the precompile leaves as
// imports, for the app's build to resolve, so there's one copy per app. A trailing
// `/*` matches any subpath. Contexts and async-context stores join when code first
// needs them.
const EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-server-dom-webpack/*',
]

function bundleName(entry, bundleType) {
  return [entry, ...Object.keys(AXES).map((a) => bundleType[a])].join('.')
}

// Every build: [{ entry, source, bundleType, name }].
function listBuilds() {
  const builds = []
  for (const { entries, bundleTypes } of Object.values(OUTPUTS)) {
    for (const bundleType of bundleTypes) {
      for (const [entry, source] of Object.entries(entries)) {
        builds.push({
          entry,
          source,
          bundleType,
          name: bundleName(entry, bundleType),
        })
      }
    }
  }
  return builds
}

// The fork sets must be complete for their axes, with no stray forks: `forks/` holds
// exactly each fork set's generic type and one fork per axis value.
function checkForks(root) {
  const expected = new Set()
  for (const [name, axis] of Object.entries(FORKS)) {
    if (!AXES[axis]) {
      throw new Error(`Fork set ${name} varies on an unknown axis, ${axis}.`)
    }
    expected.add(`${name}.d.ts`)
    for (const value of AXES[axis]) expected.add(`${name}.${value}.ts`)
  }
  const dir = path.join(root, 'forks')
  const actual = new Set(fs.existsSync(dir) ? fs.readdirSync(dir) : [])
  const missing = [...expected].filter((f) => !actual.has(f))
  const stray = [...actual].filter((f) => !expected.has(f))
  if (missing.length > 0 || stray.length > 0) {
    throw new Error(
      `native-rsc-runtime forks don't match FORKS.` +
        (missing.length > 0 ? ` Missing: ${missing.join(', ')}.` : '') +
        (stray.length > 0 ? ` Not in FORKS: ${stray.join(', ')}.` : '')
    )
  }
}

const isBuiltin = (request) =>
  request.startsWith('node:') || builtinModules.includes(request.split('/')[0])

const isExternal = (request) =>
  EXTERNALS.some((s) =>
    s.endsWith('/*') ? request.startsWith(s.slice(0, -1)) : request === s
  )

// The Rspack configs for every build of the source tree at `root`, written to `outDir`.
function createConfigs({ root, outDir }) {
  checkForks(root)
  return listBuilds().map((build) => {
    const { bundleType, name } = build
    const alias = {}
    for (const [fork, axis] of Object.entries(FORKS)) {
      alias[`#${fork}$`] = path.join(
        root,
        `forks/${fork}.${bundleType[axis]}.ts`
      )
    }
    const isRsc = build.entry === 'rsc'
    return {
      name,
      mode: 'production',
      context: root,
      entry: { [name]: path.join(root, build.source) },
      target: ['es2022'],
      devtool: 'source-map',
      output: {
        path: outDir,
        filename: '[name].js',
        module: true,
        chunkFormat: 'module',
        library: { type: 'module' },
        iife: false,
        // Source modules relative to the tree's root; the bundler's runtime modules
        // under `rspack://`.
        devtoolModuleFilenameTemplate: (info) =>
          path.isAbsolute(info.absoluteResourcePath)
            ? path
                .relative(root, info.absoluteResourcePath)
                .split(path.sep)
                .join('/')
            : `rspack://${info.absoluteResourcePath}`,
      },
      experiments: { outputModule: true },
      externalsType: 'module',
      externals: [
        ({ request }, callback) => {
          if (request && (isExternal(request) || isBuiltin(request))) {
            return callback(null, `module ${request}`)
          }
          callback()
        },
      ],
      resolve: {
        extensions: ['.ts', '.tsx', '.js'],
        alias,
        conditionNames: isRsc
          ? ['react-server', 'import', 'default']
          : ['import', 'default'],
      },
      module: {
        rules: [
          {
            test: /\.tsx?$/,
            loader: 'builtin:swc-loader',
            type: 'javascript/esm',
            options: {
              jsc: {
                parser: { syntax: 'typescript', tsx: true },
                transform: { react: { runtime: 'automatic' } },
                target: 'es2022',
              },
            },
          },
        ],
      },
      optimization: {
        minimize: true,
        // Compress only: folds and drops dead code, keeps names and whitespace. Inlining
        // stays off, so each module's code keeps its own source mappings: `inline: 0`
        // alone still inlines single-use functions through `reduce_vars`.
        minimizer: [
          new rspack.SwcJsMinimizerRspackPlugin({
            minimizerOptions: {
              minify: false,
              mangle: false,
              compress: { inline: 0, reduce_vars: false },
            },
          }),
        ],
        sideEffects: true,
        usedExports: true,
        concatenateModules: true,
        splitChunks: false,
        runtimeChunk: false,
      },
    }
  })
}

module.exports = createConfigs
