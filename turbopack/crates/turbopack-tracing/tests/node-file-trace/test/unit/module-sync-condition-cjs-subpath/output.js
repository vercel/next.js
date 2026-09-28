;[
  // A CommonJS `require()` of a subpath export whose conditions are ordered `module-sync`,
  // `webpack`, `import`, `default` - the shape published packages use to hand an ESM file to
  // `require()` on Node >= 22.12 and a CommonJS file to older Node versions. Both targets have to be
  // traced, because which one the runtime picks depends on its Node version.
  'test/unit/module-sync-condition-cjs-subpath/cjs/helper.cjs',
  'test/unit/module-sync-condition-cjs-subpath/esm/helper.mjs',
  'test/unit/module-sync-condition-cjs-subpath/input.js',
  'test/unit/module-sync-condition-cjs-subpath/package.json',
]
