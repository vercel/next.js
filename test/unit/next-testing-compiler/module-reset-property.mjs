import { runResetFixture } from './module-reset-utility.mjs'

await runResetFixture('property', {
  v2: [
    'resetModules retains its method identity, descriptors and invocation behavior',
    'direct reset invalidates the actual imported module cache',
    'an alias retained from a completed case resets the current real cache',
    'the collection alias resolves the real active runtime when later invoked',
    'the actual resetModules property preserves replacement, deletion and getter receivers',
  ],
  'old-control': [
    'the unchanged descriptor control evaluates without invalidating the actual cache',
  ],
  'property-only': [
    'a collection descriptor value invalidates the real imported namespace without a method member read',
    'descriptor-only replacement deletion getter invocation and restoration retain the real cache contract',
  ],
})
