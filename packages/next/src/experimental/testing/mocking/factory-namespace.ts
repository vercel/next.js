interface NamespaceDisplay {
  request?: string
}

/** Preserve manual factory values while enforcing the reference namespace reads. */
export function createFactoryNamespace(
  exports: Record<string, unknown>,
  targetKey: string,
  display: NamespaceDisplay
): Record<string, unknown> {
  const ignored = new Set<PropertyKey>([
    '__esModule',
    Symbol.asyncIterator,
    Symbol.hasInstance,
    Symbol.isConcatSpreadable,
    Symbol.iterator,
    Symbol.match,
    Symbol.matchAll,
    Symbol.replace,
    Symbol.search,
    Symbol.split,
    Symbol.species,
    Symbol.toPrimitive,
    Symbol.toStringTag,
    Symbol.unscopables,
  ])
  return new Proxy(exports, {
    get(moduleExports, key) {
      const value = Reflect.get(moduleExports, key)
      if (key !== 'then' && !(key in moduleExports) && !ignored.has(key)) {
        if (display.request !== undefined) {
          const error = new Error(
            `[vitest] No "${String(key)}" export is defined on the "${display.request}" mock. Did you forget to return it from "vi.mock"?\n` +
              'If you need to partially mock a module, you can use "importOriginal" helper inside:\n'
          )
          Object.assign(error, {
            codeFrame:
              `vi.mock(import("${display.request}"), async (importOriginal) => {\n` +
              '  const actual = await importOriginal()\n' +
              '  return {\n' +
              '    ...actual,\n' +
              '    // your mocked methods\n' +
              '  }\n' +
              '})',
          })
          throw error
        }
        throw new Error(
          `Module mock ${targetKey} does not define export ${JSON.stringify(String(key))}.`
        )
      }
      return value
    },
  })
}
