/* __next_internal_action_entry_do_not_use__ {"7fac840dcaf5e8197cb02b7f3a43c119b7a770b272":"bar","7fc18c215a6b7cdc64bf709f3a714ffdef1bf9651d":"default"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
const foo = async function() {};
export default /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ foo;
const bar = async function() {};
export { /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ bar };
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    foo,
    bar
]);
registerServerReference(foo, "7fc18c215a6b7cdc64bf709f3a714ffdef1bf9651d", null);
registerServerReference(bar, "7fac840dcaf5e8197cb02b7f3a43c119b7a770b272", null);
