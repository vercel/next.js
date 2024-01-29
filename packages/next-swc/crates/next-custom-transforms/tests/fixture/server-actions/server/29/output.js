/* __next_internal_action_entry_do_not_use__ {"28baf972d345b86b747ad0df73d75a0088a42214":"dec","6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0","c18c215a6b7cdc64bf709f3a714ffdef1bf9651d":"default"} */ import { createActionProxy } from "private-next-rsc-action-proxy";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export const dec = createActionProxy("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_0);
export async function $$ACTION_0(value) {
    return value - 1;
}
// Test case for https://github.com/vercel/next.js/issues/54655
export default dec;
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    dec,
    dec
]);
createActionProxy("28baf972d345b86b747ad0df73d75a0088a42214", dec);
createActionProxy("c18c215a6b7cdc64bf709f3a714ffdef1bf9651d", dec);