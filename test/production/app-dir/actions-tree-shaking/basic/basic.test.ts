import {
  nextTestSetupActionTreeShaking,
  getActionsRoutesStateByRuntime,
} from '../_testing/utils'

// TODO: revisit when we have a better side-effect free transform approach for server action
// These tests are checking that importing a single server action from a file that has multiple
// server actions, only includes the used server action in the manifest. This has both security
// benefits (not exposing unused server actions, though we also have the unguessable IDs anyway)
// and bundle size benefits (not bundling unused server actions and their dependencies).
//
// https://github.com/vercel/next.js/pull/76877 originally implemented this optimization, but
// only when importing server action modules from client components. This only happened
// accidentally because the main goal was to not include the unused server action hashes in the
// client chunk, see test/production/app-dir/actions-tree-shaking/client-actions-tree-shaking.
//
// Importing server action modules from server components did not have this optimization, so if
// it would still bundle all server actions.
//
// https://github.com/vercel/next.js/pull/91212 then reworked the server action implementation
// and now both use situation unfortunately cause all server actions to be bundled.
//
// This test still ensures that the client chunk doesn't include any unused server action hashes:
// test/production/app-dir/actions-tree-shaking/client-actions-tree-shaking/client-actions-tree-shaking.test.ts
//
// The solution here is to rework the giant
// crates/next-custom-transforms/src/transforms/server_actions.rs transform and perform the
// dataurl reexports trick also when importing from server components.
//
// So when in the client layer (already implemented):
// ```
// export {foo} from "data:text/javascript,export const foo = createServerReference('HASH'); __turbopack_emit__('./actions.ts?server_actions_impl', {data: 'foo|HASH', exports: 'foo', with: {turbopackTransition: 'next-rsc'}})";
// export {bar} from "data:...";
// ```
//
// When in the server layer:
// ```
// export {foo} from "data:text/javascript,export {foo} from './actions.ts?server_actions_impl'; __turbopack_emit__('./actions.ts?server_actions_impl', {data: 'foo|HASH', exports: 'foo'})";
// export {bar} from "data:...";
// ```
//
// And `actions.ts?server_actions_impl` would be transformed to:
// ```
// export const foo = registerServerReference(async function foo() { ... })
//
// const $$RSC_SERVER_CACHE_0_INNER = async function my_fn() { return 'data'; };
// export var $$RSC_SERVER_CACHE_0 = $$reactCache__(function my_fn() {
//     return $$cache__("default", "803128060c414d59f8552e4788b846c0d2b7f74743", 0, $$RSC_SERVER_CACHE_0_INNER, []);
// });
// export const my_fn = registerServerReference($$RSC_SERVER_CACHE_0);
// ```
//
// This way, the actual actions.ts?server_actions_impl file has accurate used exports, so unused
// code can be removed by inner graph tree shaking.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'actions-tree-shaking - basic',
  () => {
    const { next } = nextTestSetupActionTreeShaking({
      files: __dirname,
    })

    it('should not have the unused action in the manifest', async () => {
      const actionsRoutesState = await getActionsRoutesStateByRuntime(next)
      expect(actionsRoutesState).toMatchInlineSnapshot(`
       {
         "app/client/page": [
           "app/actions.js#clientComponentAction",
           "app/actions.js#serverComponentAction",
           "app/actions.js#unusedExportedAction",
         ],
         "app/inline/page": [
           "app/inline/page.js#$$RSC_SERVER_ACTION_0",
         ],
         "app/server/page": [
           "app/actions.js#clientComponentAction",
           "app/actions.js#serverComponentAction",
           "app/actions.js#unusedExportedAction",
         ],
       }
      `)
    })
  }
)
