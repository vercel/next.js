/* __next_internal_action_entry_do_not_use__ {"90b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1","c18c215a6b7cdc64bf709f3a714ffdef1bf9651d":"default"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export default $$RSC_SERVER_ACTION_0 = registerServerReference($$RSC_SERVER_ACTION_1, "90b5db271335765a4b0eab01f044b381b5ebd5cd", null);
var $$RSC_SERVER_ACTION_0;
export async function $$RSC_SERVER_ACTION_1(a, b) {
    console.log(a, b);
}
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    $$RSC_SERVER_ACTION_0
]);
registerServerReference($$RSC_SERVER_ACTION_0, "c18c215a6b7cdc64bf709f3a714ffdef1bf9651d", null);
