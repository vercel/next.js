#!/usr/bin/env node
// SWC-compile all source files that were previously compiled by taskr's
// next_compile task. Runs all variants in parallel (they are independent).

import { compileGlob } from './lib/compile-glob.mjs'

export const variants = [
  // src/bin → CLI entry points. stripExtension keeps `./bin/next` importable without extension.
  {
    name: 'bin',
    srcGlob: 'src/bin/*',
    destDir: 'dist/bin',
    serverOrClient: 'server',
    stripExtension: true,
    mode: '0755',
  },

  // src/cli — server-side CLI entry
  {
    name: 'cli',
    srcGlob: 'src/cli/**/*.+(js|ts|tsx)',
    destDir: 'dist/cli',
    serverOrClient: 'server',
  },

  // src/lib (CJS + ESM)
  {
    name: 'lib',
    srcGlob: 'src/lib/**/!(*.test).+(js|ts|tsx|json|jsonc)',
    destDir: 'dist/lib',
    serverOrClient: 'server',
  },
  {
    name: 'lib_esm',
    srcGlob: 'src/lib/**/!(*.test).+(js|ts|tsx|json|jsonc)',
    destDir: 'dist/esm/lib',
    serverOrClient: 'server',
    esm: true,
  },

  // src/server
  {
    name: 'server',
    srcGlob: 'src/server/**/!(*.test).+(js|ts|tsx)',
    destDir: 'dist/server',
    serverOrClient: 'server',
  },
  {
    name: 'server_esm',
    srcGlob: 'src/server/**/!(*.test).+(js|mts|ts|tsx)',
    destDir: 'dist/esm/server',
    serverOrClient: 'server',
    esm: true,
  },
  // src/server/**/*.wasm — copy-only (compileFile handles non-code extensions)
  {
    name: 'server_wasm',
    srcGlob: 'src/server/**/*.wasm',
    destDir: 'dist/server',
    serverOrClient: 'server',
  },

  // src/api — ESM-only, writes to both dist/api AND dist/esm/api
  {
    name: 'api_esm',
    srcGlob: 'src/api/**/*.+(js|mts|ts|tsx)',
    destDir: 'dist/api',
    additionalDestDirs: ['dist/esm/api'],
    serverOrClient: 'server',
    esm: true,
  },

  // src/build
  {
    name: 'nextbuild',
    srcGlob: 'src/build/**/*.+(js|ts|tsx)',
    ignore: [
      '**/fixture/**',
      '**/tests/**',
      '**/jest/**',
      '**/*.test.d.ts',
      '**/*.test.+(js|ts|tsx)',
    ],
    destDir: 'dist/build',
    serverOrClient: 'server',
  },
  {
    name: 'nextbuild_esm',
    srcGlob: 'src/build/**/*.+(js|ts|tsx)',
    ignore: [
      '**/fixture/**',
      '**/tests/**',
      '**/jest/**',
      '**/*.test.d.ts',
      '**/*.test.+(js|ts|tsx)',
    ],
    destDir: 'dist/esm/build',
    serverOrClient: 'server',
    esm: true,
  },
  {
    name: 'nextbuildjest',
    srcGlob: 'src/build/jest/**/*.+(js|ts|tsx)',
    ignore: [
      '**/fixture/**',
      '**/tests/**',
      '**/*.test.d.ts',
      '**/*.test.+(js|ts|tsx)',
    ],
    destDir: 'dist/build/jest',
    serverOrClient: 'server',
    interopClientDefaultExport: true,
  },

  // src/client
  {
    name: 'client',
    srcGlob: 'src/client/**/!(*.test|*.stories).+(js|ts|tsx|woff2)',
    destDir: 'dist/client',
    serverOrClient: 'client',
    interopClientDefaultExport: true,
  },
  {
    name: 'client_esm',
    srcGlob: 'src/client/**/!(*.test|*.stories).+(js|ts|tsx|woff2)',
    destDir: 'dist/esm/client',
    serverOrClient: 'client',
    esm: true,
  },

  // src/next-devtools
  {
    name: 'next_devtools_entrypoint',
    srcGlob: 'src/next-devtools/dev-overlay.shim.ts',
    destDir: 'dist/next-devtools',
    serverOrClient: 'client',
    interopClientDefaultExport: true,
    srcBase: 'src/next-devtools',
  },
  {
    name: 'next_devtools_server',
    srcGlob: 'src/next-devtools/server/**/!(*.test|*.stories).+(js|ts|tsx|woff2)',
    destDir: 'dist/next-devtools/server',
    serverOrClient: 'client',
    interopClientDefaultExport: true,
  },
  {
    name: 'next_devtools_server_esm',
    srcGlob: 'src/next-devtools/server/**/!(*.test|*.stories).+(js|ts|tsx|woff2)',
    destDir: 'dist/esm/next-devtools/server',
    serverOrClient: 'client',
    esm: true,
  },
  {
    name: 'next_devtools_shared',
    srcGlob: 'src/next-devtools/shared/**/!(*.test|*.stories).+(js|ts|tsx|woff2)',
    destDir: 'dist/next-devtools/shared',
    serverOrClient: 'client',
    interopClientDefaultExport: true,
  },
  {
    name: 'next_devtools_shared_esm',
    srcGlob: 'src/next-devtools/shared/**/!(*.test|*.stories).+(js|ts|tsx|woff2)',
    destDir: 'dist/esm/next-devtools/shared',
    serverOrClient: 'client',
    esm: true,
  },
  {
    name: 'next_devtools_userspace',
    srcGlob: 'src/next-devtools/userspace/**/!(*.test|*.stories).+(js|ts|tsx|woff2)',
    destDir: 'dist/next-devtools/userspace',
    serverOrClient: 'client',
    interopClientDefaultExport: true,
  },
  {
    name: 'next_devtools_userspace_esm',
    srcGlob: 'src/next-devtools/userspace/**/!(*.test|*.stories).+(js|ts|tsx|woff2)',
    destDir: 'dist/esm/next-devtools/userspace',
    serverOrClient: 'client',
    esm: true,
  },

  // src/export (renamed to nextbuildstatic because 'export' is a reserved keyword)
  {
    name: 'nextbuildstatic',
    srcGlob: 'src/export/**/!(*.test).+(js|ts|tsx)',
    destDir: 'dist/export',
    serverOrClient: 'server',
  },
  {
    name: 'nextbuildstatic_esm',
    srcGlob: 'src/export/**/!(*.test).+(js|ts|tsx)',
    destDir: 'dist/esm/export',
    serverOrClient: 'server',
    esm: true,
  },

  // src/pages — three entry points (app, error, document), each emitted twice (CJS + ESM).
  {
    name: 'pages_app',
    srcGlob: 'src/pages/_app.tsx',
    destDir: 'dist/pages',
    serverOrClient: 'client',
    interopClientDefaultExport: true,
    srcBase: 'src/pages',
  },
  {
    name: 'pages_error',
    srcGlob: 'src/pages/_error.tsx',
    destDir: 'dist/pages',
    serverOrClient: 'client',
    interopClientDefaultExport: true,
    srcBase: 'src/pages',
  },
  {
    name: 'pages_document',
    srcGlob: 'src/pages/_document.tsx',
    destDir: 'dist/pages',
    serverOrClient: 'server',
    srcBase: 'src/pages',
  },
  {
    name: 'pages_app_esm',
    srcGlob: 'src/pages/_app.tsx',
    destDir: 'dist/esm/pages',
    serverOrClient: 'client',
    esm: true,
    srcBase: 'src/pages',
  },
  {
    name: 'pages_error_esm',
    srcGlob: 'src/pages/_error.tsx',
    destDir: 'dist/esm/pages',
    serverOrClient: 'client',
    esm: true,
    srcBase: 'src/pages',
  },
  {
    name: 'pages_document_esm',
    srcGlob: 'src/pages/_document.tsx',
    destDir: 'dist/esm/pages',
    serverOrClient: 'server',
    esm: true,
    srcBase: 'src/pages',
  },

  // leaf subsystems
  {
    name: 'telemetry',
    srcGlob: 'src/telemetry/**/*.+(js|ts|tsx)',
    destDir: 'dist/telemetry',
    serverOrClient: 'server',
  },
  {
    name: 'trace',
    srcGlob: 'src/trace/**/*.+(js|ts|tsx)',
    destDir: 'dist/trace',
    serverOrClient: 'server',
  },
  {
    name: 'diagnostics',
    srcGlob: 'src/diagnostics/**/*.+(js|ts|tsx)',
    destDir: 'dist/diagnostics',
    serverOrClient: 'server',
  },

  // src/shared — two passes each for CJS+ESM.
  // Non-re-exported pass: exclude the "re-exported" files by glob.
  {
    name: 'shared',
    srcGlob: 'src/shared/**/*.+(js|ts|tsx)',
    ignore: [
      'src/shared/**/{config,constants,dynamic,app-dynamic,head,runtime-config}.+(js|ts|tsx)',
      '**/*.test.d.ts',
      '**/*.test.+(js|ts|tsx)',
    ],
    destDir: 'dist/shared',
    serverOrClient: 'client',
  },
  {
    name: 'shared_esm',
    srcGlob: 'src/shared/**/*.+(js|ts|tsx)',
    ignore: [
      'src/shared/**/{config,constants,dynamic,app-dynamic,head,runtime-config}.+(js|ts|tsx)',
      '**/*.test.d.ts',
      '**/*.test.+(js|ts|tsx)',
    ],
    destDir: 'dist/esm/shared',
    serverOrClient: 'client',
    esm: true,
  },
  // Re-exported pass: just the config/constants/dynamic/etc. files, with interop for CJS.
  {
    name: 'shared_re_exported',
    srcGlob:
      'src/shared/**/{config,constants,dynamic,app-dynamic,head,runtime-config}.+(js|ts|tsx)',
    ignore: ['**/*.test.d.ts', '**/*.test.+(js|ts|tsx)'],
    destDir: 'dist/shared',
    serverOrClient: 'client',
    interopClientDefaultExport: true,
  },
  {
    // NB: the ESM re-exported pattern intentionally omits `runtime-config` — taskfile.js
    // does this too. Do not "fix" without verifying.
    name: 'shared_re_exported_esm',
    srcGlob:
      'src/shared/**/{config,constants,app-dynamic,dynamic,head}.+(js|ts|tsx)',
    ignore: ['**/*.test.d.ts', '**/*.test.+(js|ts|tsx)'],
    destDir: 'dist/esm/shared',
    serverOrClient: 'client',
    esm: true,
  },

  // experimental/
  {
    name: 'experimental_testing',
    srcGlob: 'src/experimental/testing/**/!(*.test).+(js|ts|tsx)',
    destDir: 'dist/experimental/testing',
    serverOrClient: 'server',
  },
  {
    name: 'experimental_testmode',
    srcGlob: 'src/experimental/testmode/**/!(*.test).+(js|ts|tsx)',
    destDir: 'dist/experimental/testmode',
    serverOrClient: 'server',
  },
]

/**
 * Copy `apps/bundle-analyzer/dist` → `packages/next/dist/bundle-analyzer`.
 * Not a SWC compile; it's a recursive file copy.
 */
async function copyBundleAnalyzerUI() {
  const path = await import('node:path')
  const { promises: fs } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const PKG_ROOT = path.resolve(__dirname, '..')
  const src = path.join(PKG_ROOT, '../../apps/bundle-analyzer/dist')
  const dest = path.join(PKG_ROOT, 'dist/bundle-analyzer')
  try {
    await fs.access(src)
  } catch {
    return // bundle-analyzer not built; skip.
  }
  await fs.mkdir(dest, { recursive: true })
  await fs.cp(src, dest, { recursive: true, force: true })
}

async function main() {
  const start = Date.now()
  const jobs = [
    ...variants.map(async (variant) => {
      const t0 = Date.now()
      await compileGlob(variant)
      const elapsed = Date.now() - t0
      console.log(`[compile] ${variant.name.padEnd(32)} ${elapsed.toString().padStart(5)}ms`)
    }),
    copyBundleAnalyzerUI().then(() =>
      console.log('[compile] copy_bundle_analyzer_ui done')
    ),
  ]
  await Promise.all(jobs)
  console.log(`[compile] TOTAL: ${Date.now() - start}ms`)
}

// Only run when invoked directly, not when imported (e.g. by watch.mjs).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
