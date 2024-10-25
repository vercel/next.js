<<<<<<< HEAD
/* __next_internal_action_entry_do_not_use__ {"7f28baf972d345b86b747ad0df73d75a0088a42214":"dec","7f6a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","7fc18c215a6b7cdc64bf709f3a714ffdef1bf9651d":"default"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export const dec = registerServerReference($$RSC_SERVER_ACTION_0, "406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
export async function $$RSC_SERVER_ACTION_0(value) {
=======
/* __next_internal_action_entry_do_not_use__ {"28baf972d345b86b747ad0df73d75a0088a42214":"dec","c18c215a6b7cdc64bf709f3a714ffdef1bf9651d":"default"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export const dec = async (value)=>{
>>>>>>> canary
    return value - 1;
};
// Test case for https://github.com/vercel/next.js/issues/54655
export default dec;
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    dec,
    dec
]);
registerServerReference(dec, "ff28baf972d345b86b747ad0df73d75a0088a42214", null);
registerServerReference(dec, "ffc18c215a6b7cdc64bf709f3a714ffdef1bf9651d", null);
