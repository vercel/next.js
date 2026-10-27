const fs = require('fs')
const path = require('path')
const { createRequire } = require('module')

const esmDir = path.join(__dirname, 'dist/esm') + path.sep
const externalFiles = new Set([
  'server/require-hook.js',
  'server/lib/cpu-profile.js',
  'server/lib/trace/tracer.js',
  'server/lib/router-utils/setup-dev-bundler.js',
  'server/image-optimizer.js',
  'server/next-typescript.js',
])

module.exports = () => ({
  entryPoints: [path.join(esmDir, 'server/lib/start-server.js')],
  outfile: path.join(
    __dirname,
    'dist/compiled/next-server/start-server.runtime.prod.js'
  ),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20.9',
  minify: true,
  sourcemap: true,
  packages: 'external',
  plugins: [
    {
      name: 'next-runtime-externals',
      setup(build) {
        build.onResolve({ filter: /^\./ }, (args) => {
          const resolve = createRequire(args.importer).resolve
          let resolved
          try {
            resolved = resolve(args.path)
          } catch {
            // Some directories (including trace and telemetry) have no ESM build.
            resolved = resolve(
              path
                .resolve(args.resolveDir, args.path)
                .replace(esmDir, path.join(__dirname, 'dist') + path.sep)
            )
            return {
              path: `next/${path.relative(__dirname, resolved).replace(/\\/g, '/')}`,
              external: true,
            }
          }
          const relative = path.relative(esmDir, resolved).replace(/\\/g, '/')
          if (
            externalFiles.has(relative) ||
            /\.external\.js$|\.compiled\.js$/.test(relative) ||
            /^(server\/dev\/|server\/web\/sandbox(?:\/|\.js$)|next-devtools\/|trace\/)/.test(
              relative
            ) ||
            (relative.startsWith('build/') &&
              !relative.startsWith('build/output/') &&
              relative !== 'build/duration-to-string.js')
          ) {
            return { path: `next/dist/${relative}`, external: true }
          }
        })
        build.onEnd(({ errors }) => {
          if (errors.length) return
          const mapPath = build.initialOptions.outfile + '.map'
          const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'))
          map.ignoreList = map.sources.map((_, index) => index)
          fs.writeFileSync(mapPath, JSON.stringify(map))
        })
        build.onLoad(
          { filter: /[\\/]esm[\\/]server[\\/]next\.js$/ },
          (args) => ({
            // The CommonJS bridge belongs to the unbundled require('next') entry.
            contents: fs
              .readFileSync(args.path, 'utf8')
              .replace('module.exports = createServer;', ''),
            loader: 'js',
          })
        )
      },
    },
  ],
})
