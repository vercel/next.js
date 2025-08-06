/**
 * This is a rather contrived test. The trick is to construct a scenario where
 * Math.random is called during the create-component-tree phase but not during the render.
 * To do this we patch Symbol.for. When the `react.client.reference` symbol is checked
 * we know that this is happening in the create-component-tree function. Given the simple
 * setup of the test page this symbol is not checked during the actual prerender itself.
 *
 * This test may flake in the future. It should be replaced ideally with a test that uses
 * our OTel implementation to ensure that the built-in trace in create-component-tree does not
 * early abort the prerender. The problem is that we are about to make these functions avoid the
 * workUnitStore scope so it will not express the regression for other reasons.
 */
function patchSymbolFor() {
  const isPatched = globalThis[Symbol.for('__SYMBOL_FOR_PATCHED__')]
  if (!isPatched) {
    console.log('patching')
    globalThis[Symbol.for('__SYMBOL_FOR_PATCHED__')] = true

    const originalSymbolFor = Symbol.for

    Symbol.for = (...args) => {
      if (args[0] === 'react.client.reference') {
        Math.random()
      }
      return originalSymbolFor.apply(Symbol, args)
    }
  }
}

patchSymbolFor()

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
