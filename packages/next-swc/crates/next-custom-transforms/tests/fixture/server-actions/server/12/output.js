/* __next_internal_action_entry_do_not_use__ {"c18c215a6b7cdc64bf709f3a714ffdef1bf9651d":"default"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
async function foo() {}
export default foo;
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    foo
]);
registerServerReference("c18c215a6b7cdc64bf709f3a714ffdef1bf9651d", foo);
