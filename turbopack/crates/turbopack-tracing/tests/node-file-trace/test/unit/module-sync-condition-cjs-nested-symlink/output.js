;[
  // The `@scope/helpers` package is reachable through two `node_modules` directories (as in a pnpm
  // install, where the virtual store hoists every package into `node_modules/.pnpm/node_modules`).
  // Resolving the same request in more than one directory must not drop the alternatives a single
  // directory resolved to: both the `module-sync` target (picked by `require()` on Node >= 22.12)
  // and the `default` target (picked by older Node versions) have to be traced.
  'package.json',
  'test/unit/module-sync-condition-cjs-nested-symlink/input.js',
  'test/unit/module-sync-condition-cjs-nested-symlink/node_modules/.store/helpers@1.0.0/node_modules/@scope/helpers/cjs/helper.cjs',
  'test/unit/module-sync-condition-cjs-nested-symlink/node_modules/.store/helpers@1.0.0/node_modules/@scope/helpers/esm/helper.js',
  'test/unit/module-sync-condition-cjs-nested-symlink/node_modules/.store/helpers@1.0.0/node_modules/@scope/helpers/package.json',
  'test/unit/module-sync-condition-cjs-nested-symlink/node_modules/.store/pkg@1.0.0/node_modules/pkg/index.js',
  'test/unit/module-sync-condition-cjs-nested-symlink/node_modules/.store/pkg@1.0.0/node_modules/pkg/package.json',
]
