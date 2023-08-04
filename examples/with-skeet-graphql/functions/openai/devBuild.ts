import { build } from 'esbuild'
;(async () => {
  await build({
    entryPoints: ['./src/index.ts'],
    bundle: true,
    minify: true,
    outfile: './dist/index.js',
    platform: 'node',
    define: {
      'process.env.NODE_ENV': `"development"`,
    },
    format: 'cjs',
  })
})()
