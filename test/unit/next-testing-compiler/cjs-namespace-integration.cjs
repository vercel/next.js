const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const runtimePath =
  process.argv[2] ||
  path.join(
    __dirname,
    '../../../turbopack/crates/turbopack-ecmascript-runtime/js/src/shared/runtime/runtime-utils.ts'
  )
const source = fs.readFileSync(runtimePath, 'utf8')
const emitted = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None,
  },
}).outputText
// Evaluate the complete shared runtime, with ordinary retained module records.
// Both the exported values and the runtime execute in the same realm.
const context = vm.createContext({ URL })
vm.runInContext(
  `
  const records = new Map([
    ['fulfilled', { id: 'fulfilled', exports: Promise.resolve(42) }],
    ['pending', { id: 'pending', exports: new Promise(() => {}) }],
    ['own', { id: 'own', exports: { then(resolve) { resolve('own then') } } }],
    ['inherited', { id: 'inherited', exports: Object.create({ then(resolve) { resolve('inherited then') } }) }],
  ]);
  function getOrInstantiateModuleFromParent(id) { return records.get(id) }
  ${emitted}
  globalThis.context = new Context({ id: 'consumer' }, {});
  `,
  context,
  { filename: runtimePath }
)
;(async () => {
  const observations = await vm.runInContext(
    `(async () => {
      const rows = [];
      for (const id of ['fulfilled', 'pending', 'own', 'inherited']) {
        const namespace = context.i(id);
        const raw = context.r(id);
        let result, error;
        try {
          const adopted = await Promise.resolve(namespace);
          result = typeof adopted === 'string' ? adopted : 'namespace';
        } catch (caught) {
          error = { name: caught.name, message: caught.message };
        }
        rows.push({
          id,
          keys: Object.keys(namespace).sort(),
          defaultIdentity: namespace.default === raw,
          cachedNamespace: context.i(id) === namespace,
          cachedRaw: context.r(id) === raw,
          thenType: typeof namespace.then,
          result,
          error,
        });
      }
      return rows;
    })()`,
    context
  )
  // Retain the actual observations before any assertion, including old failures.
  process.stdout.write(JSON.stringify(observations) + '\n')
  assert.deepEqual(JSON.parse(JSON.stringify(observations)), [
    {
      id: 'fulfilled',
      keys: ['default'],
      defaultIdentity: true,
      cachedNamespace: true,
      cachedRaw: true,
      thenType: 'undefined',
      result: 'namespace',
    },
    {
      id: 'pending',
      keys: ['default'],
      defaultIdentity: true,
      cachedNamespace: true,
      cachedRaw: true,
      thenType: 'undefined',
      result: 'namespace',
    },
    {
      id: 'own',
      keys: ['default', 'then'],
      defaultIdentity: true,
      cachedNamespace: true,
      cachedRaw: true,
      thenType: 'function',
      result: 'own then',
    },
    {
      id: 'inherited',
      keys: ['default', 'then'],
      defaultIdentity: true,
      cachedNamespace: true,
      cachedRaw: true,
      thenType: 'function',
      result: 'inherited then',
    },
  ])
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
