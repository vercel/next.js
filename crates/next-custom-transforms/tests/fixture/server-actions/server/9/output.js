// app/send.ts
/* __next_internal_action_entry_do_not_use__ {"7f050e3854b72b19e3c7e3966a67535543a90bf7e0":"baz","7fab21efdafbe611287bc25c0462b1e0510d13e48b":"foo","7fc18c215a6b7cdc64bf709f3a714ffdef1bf9651d":"default"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
async function foo() {}
export { /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ foo };
async function bar() {}
export { /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ bar as baz };
async function qux() {}
export { /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ qux as default };
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    foo,
    bar,
    qux
]);
registerServerReference(foo, "7fab21efdafbe611287bc25c0462b1e0510d13e48b", null);
registerServerReference(bar, "7f050e3854b72b19e3c7e3966a67535543a90bf7e0", null);
registerServerReference(qux, "7fc18c215a6b7cdc64bf709f3a714ffdef1bf9651d", null);
