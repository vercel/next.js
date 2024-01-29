/* eslint-env jest */
import { sandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('ReactRefreshRequire', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })

  // https://github.com/facebook/metro/blob/b651e535cd0fc5df6c0803b9aa647d664cb9a6c3/packages/metro/src/lib/polyfills/__tests__/require-test.js#L989-L1048
  test('re-runs accepted modules', async () => {
    const { session, cleanup } = await sandbox(next)

    await session.patch(
      'index.js',
      `export default function Noop() { return null; };`
    )

    await session.write(
      './foo.js',
      `window.log.push('init FooV1'); require('./bar');`
    )
    await session.write(
      './bar.js',
      `window.log.push('init BarV1'); export default function Bar() { return null; };`
    )

    await session.evaluate(() => ((window as any).log = []))
    await session.patch(
      'index.js',
      `require('./foo'); export default function Noop() { return null; };`
    )
    expect(await session.evaluate(() => (window as any).log)).toEqual([
      'init FooV1',
      'init BarV1',
    ])

    // We only edited Bar, and it accepted.
    // So we expect it to re-run alone.
    await session.evaluate(() => ((window as any).log = []))
    await session.patch(
      './bar.js',
      `window.log.push('init BarV2'); export default function Bar() { return null; };`
    )
    expect(await session.evaluate(() => (window as any).log)).toEqual([
      'init BarV2',
    ])

    // We only edited Bar, and it accepted.
    // So we expect it to re-run alone.
    await session.evaluate(() => ((window as any).log = []))
    await session.patch(
      './bar.js',
      `window.log.push('init BarV3'); export default function Bar() { return null; };`
    )
    expect(await session.evaluate(() => (window as any).log)).toEqual([
      'init BarV3',
    ])

    // TODO:
    // expect(Refresh.performReactRefresh).toHaveBeenCalled();
    // expect(Refresh.performFullRefresh).not.toHaveBeenCalled();

    await cleanup()
  })

  // https://github.com/facebook/metro/blob/b651e535cd0fc5df6c0803b9aa647d664cb9a6c3/packages/metro/src/lib/polyfills/__tests__/require-test.js#L1050-L1137
  test('propagates a hot update to closest accepted module', async () => {
    const { session, cleanup } = await sandbox(next)

    await session.patch(
      'index.js',
      `export default function Noop() { return null; };`
    )

    await session.write(
      './foo.js',
      `
      window.log.push('init FooV1');
      require('./bar');

      // Exporting a component marks it as auto-accepting.
      export default function Foo() {};
      `
    )

    await session.write('./bar.js', `window.log.push('init BarV1');`)

    await session.evaluate(() => ((window as any).log = []))
    await session.patch(
      'index.js',
      `require('./foo'); export default function Noop() { return null; };`
    )

    expect(await session.evaluate(() => (window as any).log)).toEqual([
      'init FooV1',
      'init BarV1',
    ])

    // We edited Bar, but it doesn't accept.
    // So we expect it to re-run together with Foo which does.
    await session.evaluate(() => ((window as any).log = []))
    await session.patch('./bar.js', `window.log.push('init BarV2');`)
    expect(await session.evaluate(() => (window as any).log)).toEqual([
      // // FIXME: Metro order:
      // 'init BarV2',
      // 'init FooV1',
      'init FooV1',
      'init BarV2',
      // Webpack runs in this order because it evaluates modules parent down, not
      // child up. Parents will re-run child modules in the order that they're
      // imported from the parent.
    ])

    // We edited Bar, but it doesn't accept.
    // So we expect it to re-run together with Foo which does.
    await session.evaluate(() => ((window as any).log = []))
    await session.patch('./bar.js', `window.log.push('init BarV3');`)
    expect(await session.evaluate(() => (window as any).log)).toEqual([
      // // FIXME: Metro order:
      // 'init BarV3',
      // 'init FooV1',
      'init FooV1',
      'init BarV3',
      // Webpack runs in this order because it evaluates modules parent down, not
      // child up. Parents will re-run child modules in the order that they're
      // imported from the parent.
    ])

    // We edited Bar so that it accepts itself.
    // We still re-run Foo because the exports of Bar changed.
    await session.evaluate(() => ((window as any).log = []))
    await session.patch(
      './bar.js',
      `
      window.log.push('init BarV3');
      // Exporting a component marks it as auto-accepting.
      export default function Bar() {};
      `
    )
    expect(await session.evaluate(() => (window as any).log)).toEqual([
      // // FIXME: Metro order:
      // 'init BarV3',
      // 'init FooV1',
      'init FooV1',
      'init BarV3',
      // Webpack runs in this order because it evaluates modules parent down, not
      // child up. Parents will re-run child modules in the order that they're
      // imported from the parent.
    ])

    // Further edits to Bar don't re-run Foo.
    await session.evaluate(() => ((window as any).log = []))
    await session.patch(
      './bar.js',
      `
      window.log.push('init BarV4');
      export default function Bar() {};
      `
    )
    expect(await session.evaluate(() => (window as any).log)).toEqual([
      'init BarV4',
    ])

    // TODO:
    // expect(Refresh.performReactRefresh).toHaveBeenCalled();
    // expect(Refresh.performFullRefresh).not.toHaveBeenCalled();

    await cleanup()
  })
  // https://github.com/facebook/metro/blob/b651e535cd0fc5df6c0803b9aa647d664cb9a6c3/packages/metro/src/lib/polyfills/__tests__/require-test.js#L1139-L1307
  test('propagates hot update to all inverse dependencies', async () => {
    const { session, cleanup } = await sandbox(next)

    await session.patch(
      'index.js',
      `export default function Noop() { return null; };`
    )

    // This is the module graph:
    //        MiddleA*
    //     /            \
    // Root* - MiddleB*  - Leaf
    //     \
    //        MiddleC
    //
    // * - accepts update
    //
    // We expect that editing Leaf will propagate to
    // MiddleA and MiddleB both of which can handle updates.

    await session.write(
      'root.js',
      `
      window.log.push('init RootV1');

      import './middleA';
      import './middleB';
      import './middleC';

      export default function Root() {};
      `
    )
    await session.write(
      'middleA.js',
      `
      log.push('init MiddleAV1');

      import './leaf';

      export default function MiddleA() {};
      `
    )
    await session.write(
      'middleB.js',
      `
      log.push('init MiddleBV1');

      import './leaf';

      export default function MiddleB() {};
      `
    )
    // This one doesn't import leaf and also doesn't export a component (so it
    // doesn't accept updates).
    await session.write(
      'middleC.js',
      `log.push('init MiddleCV1'); export default {};`
    )

    // Doesn't accept its own updates; they will propagate.
    await session.write(
      'leaf.js',
      `log.push('init LeafV1'); export default {};`
    )

    // Bootstrap:
    await session.evaluate(() => ((window as any).log = []))
    await session.patch(
      'index.js',
      `require('./root'); export default function Noop() { return null; };`
    )

    expect(await session.evaluate(() => (window as any).log)).toEqual([
      'init LeafV1',
      'init MiddleAV1',
      'init MiddleBV1',
      'init MiddleCV1',
      'init RootV1',
    ])

    // We edited Leaf, but it doesn't accept.
    // So we expect it to re-run together with MiddleA and MiddleB which do.
    await session.evaluate(() => ((window as any).log = []))
    await session.patch(
      'leaf.js',
      `log.push('init LeafV2'); export default {};`
    )
    expect(await session.evaluate(() => (window as any).log)).toEqual([
      'init LeafV2',
      'init MiddleAV1',
      'init MiddleBV1',
    ])

    // Let's try the same one more time.
    await session.evaluate(() => ((window as any).log = []))
    await session.patch(
      'leaf.js',
      `log.push('init LeafV3'); export default {};`
    )
    expect(await session.evaluate(() => (window as any).log)).toEqual([
      'init LeafV3',
      'init MiddleAV1',
      'init MiddleBV1',
    ])

    // Now edit MiddleB. It should accept and re-run alone.
    await session.evaluate(() => ((window as any).log = []))
    await session.patch(
      'middleB.js',
      `
      log.push('init MiddleBV2');

      import './leaf';

      export default function MiddleB() {};
      `
    )
    expect(await session.evaluate(() => (window as any).log)).toEqual([
      'init MiddleBV2',
    ])

    // Finally, edit MiddleC. It didn't accept so it should bubble to Root.
    await session.evaluate(() => ((window as any).log = []))

    await session.patch(
      'middleC.js',
      `log.push('init MiddleCV2'); export default {};`
    )
    expect(await session.evaluate(() => (window as any).log)).toEqual([
      'init MiddleCV2',
      'init RootV1',
    ])

    // TODO:
    // expect(Refresh.performReactRefresh).toHaveBeenCalled()
    // expect(Refresh.performFullRefresh).not.toHaveBeenCalled()

    await cleanup()
  })

  // https://github.com/facebook/metro/blob/b651e535cd0fc5df6c0803b9aa647d664cb9a6c3/packages/metro/src/lib/polyfills/__tests__/require-test.js#L1309-L1406
  test('runs dependencies before dependents', async () => {
    // TODO:
  })

  // https://github.com/facebook/metro/blob/b651e535cd0fc5df6c0803b9aa647d664cb9a6c3/packages/metro/src/lib/polyfills/__tests__/require-test.js#L1408-L1498
  test('provides fresh value for module.exports in parents', async () => {
    // TODO:
  })

  // https://github.com/facebook/metro/blob/b651e535cd0fc5df6c0803b9aa647d664cb9a6c3/packages/metro/src/lib/polyfills/__tests__/require-test.js#L1500-L1590
  test('provides fresh value for exports.* in parents', async () => {
    // TODO:
  })

  // https://github.com/facebook/metro/blob/b651e535cd0fc5df6c0803b9aa647d664cb9a6c3/packages/metro/src/lib/polyfills/__tests__/require-test.js#L1592-L1688
  test('provides fresh value for ES6 named import in parents', async () => {
    // TODO:
  })

  // https://github.com/facebook/metro/blob/b651e535cd0fc5df6c0803b9aa647d664cb9a6c3/packages/metro/src/lib/polyfills/__tests__/require-test.js#L1690-L1786
  test('provides fresh value for ES6 default import in parents', async () => {
    // TODO:
  })

  // https://github.com/facebook/metro/blob/b651e535cd0fc5df6c0803b9aa647d664cb9a6c3/packages/metro/src/lib/polyfills/__tests__/require-test.js#L1788-L1899
  test('stops update propagation after module-level errors', async () => {
    // TODO:
  })

  // https://github.com/facebook/metro/blob/b651e535cd0fc5df6c0803b9aa647d664cb9a6c3/packages/metro/src/lib/polyfills/__tests__/require-test.js#L1901-L2010
  test('can continue hot updates after module-level errors with module.exports', async () => {
    // TODO:
  })

  // https://github.com/facebook/metro/blob/b651e535cd0fc5df6c0803b9aa647d664cb9a6c3/packages/metro/src/lib/polyfills/__tests__/require-test.js#L2012-L2123
  test('can continue hot updates after module-level errors with ES6 exports', async () => {
    // TODO:
  })

  // https://github.com/facebook/metro/blob/b651e535cd0fc5df6c0803b9aa647d664cb9a6c3/packages/metro/src/lib/polyfills/__tests__/require-test.js#L2125-L2233
  test('does not accumulate stale exports over time', async () => {
    // TODO:
  })

  // https://github.com/facebook/metro/blob/b651e535cd0fc5df6c0803b9aa647d664cb9a6c3/packages/metro/src/lib/polyfills/__tests__/require-test.js#L2235-L2279
  test('bails out if update bubbles to the root via the only path', async () => {
    // TODO:
  })

  // https://github.com/facebook/metro/blob/b651e535cd0fc5df6c0803b9aa647d664cb9a6c3/packages/metro/src/lib/polyfills/__tests__/require-test.js#L2281-L2371
  test('bails out if the update bubbles to the root via one of the paths', async () => {
    // TODO:
  })

  // https://github.com/facebook/metro/blob/b651e535cd0fc5df6c0803b9aa647d664cb9a6c3/packages/metro/src/lib/polyfills/__tests__/require-test.js#L2373-L2472
  test('propagates a module that stops accepting in next version', async () => {
    const { session, cleanup } = await sandbox(next)

    // Accept in parent
    await session.write(
      './foo.js',
      `;(typeof global !== 'undefined' ? global : window).log.push('init FooV1'); import './bar'; export default function Foo() {};`
    )
    // Accept in child
    await session.write(
      './bar.js',
      `;(typeof global !== 'undefined' ? global : window).log.push('init BarV1'); export default function Bar() {};`
    )

    // Bootstrap:
    await session.patch(
      'index.js',
      `;(typeof global !== 'undefined' ? global : window).log = []; require('./foo'); export default () => null;`
    )
    expect(await session.evaluate(() => (window as any).log)).toEqual([
      'init BarV1',
      'init FooV1',
    ])

    let didFullRefresh = false
    // Verify the child can accept itself:
    await session.evaluate(() => ((window as any).log = []))
    didFullRefresh =
      didFullRefresh ||
      !(await session.patch(
        './bar.js',
        `window.log.push('init BarV1.1'); export default function Bar() {};`
      ))
    expect(await session.evaluate(() => (window as any).log)).toEqual([
      'init BarV1.1',
    ])

    // Now let's change the child to *not* accept itself.
    // We'll expect that now the parent will handle the evaluation.
    await session.evaluate(() => ((window as any).log = []))
    didFullRefresh =
      didFullRefresh ||
      !(await session.patch(
        './bar.js',
        // It's important we still export _something_, otherwise webpack will
        // also emit an extra update to the parent module. This happens because
        // webpack converts the module from ESM to CJS, which means the parent
        // module must update how it "imports" the module (drops interop code).
        // TODO: propose that webpack interrupts the current update phase when
        // `module.hot.invalidate()` is called.
        `window.log.push('init BarV2'); export {};`
      ))
    // We re-run Bar and expect to stop there. However,
    // it didn't export a component, so we go higher.
    // We stop at Foo which currently _does_ export a component.
    expect(await session.evaluate(() => (window as any).log)).toEqual([
      // Bar evaluates twice:
      // 1. To invalidate itself once it realizes it's no longer acceptable.
      // 2. As a child of Foo re-evaluating.
      'init BarV2',
      'init BarV2',
      'init FooV1',
    ])

    // Change it back so that the child accepts itself.
    await session.evaluate(() => ((window as any).log = []))
    didFullRefresh =
      didFullRefresh ||
      !(await session.patch(
        './bar.js',
        `window.log.push('init BarV2'); export default function Bar() {};`
      ))
    // Since the export list changed, we have to re-run both the parent
    // and the child.
    expect(await session.evaluate(() => (window as any).log)).toEqual([
      'init BarV2',
      'init FooV1',
    ])

    // TODO:
    // expect(Refresh.performReactRefresh).toHaveBeenCalled();

    // expect(Refresh.performFullRefresh).not.toHaveBeenCalled();
    expect(didFullRefresh).toBe(false)

    // But editing the child alone now doesn't reevaluate the parent.
    await session.evaluate(() => ((window as any).log = []))
    didFullRefresh =
      didFullRefresh ||
      !(await session.patch(
        './bar.js',
        `window.log.push('init BarV3'); export default function Bar() {};`
      ))
    expect(await session.evaluate(() => (window as any).log)).toEqual([
      'init BarV3',
    ])

    // Finally, edit the parent in a way that changes the export.
    // It would still be accepted on its own -- but it's incompatible
    // with the past version which didn't have two exports.
    await session.evaluate(() => window.localStorage.setItem('init', ''))
    didFullRefresh =
      didFullRefresh ||
      !(await session.patch(
        './foo.js',
        `
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('init', 'init FooV2')
        }
        export function Foo() {};
        export function FooFoo() {};`
      ))

    // Check that we attempted to evaluate, but had to fall back to full refresh.
    expect(
      await session.evaluate(() => window.localStorage.getItem('init'))
    ).toEqual('init FooV2')

    // expect(Refresh.performFullRefresh).toHaveBeenCalled();
    expect(didFullRefresh).toBe(true)

    await cleanup()
  })

  // https://github.com/facebook/metro/blob/b651e535cd0fc5df6c0803b9aa647d664cb9a6c3/packages/metro/src/lib/polyfills/__tests__/require-test.js#L2474-L2521
  test('can replace a module before it is loaded', async () => {
    // TODO:
  })
})
