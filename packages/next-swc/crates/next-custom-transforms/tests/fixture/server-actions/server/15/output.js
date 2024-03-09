/* __next_internal_action_entry_do_not_use__ {"188d5d945750dc32e2c842b93c75a65763d4a922":"$$ACTION_1","c18c215a6b7cdc64bf709f3a714ffdef1bf9651d":"default"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export default $$ACTION_0 = registerServerReference("188d5d945750dc32e2c842b93c75a65763d4a922", $$ACTION_1);
var $$ACTION_0;
export async function $$ACTION_1(a, b) {
    console.log(a, b);
}
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    $$ACTION_0
]);
registerServerReference("c18c215a6b7cdc64bf709f3a714ffdef1bf9651d", $$ACTION_0);
