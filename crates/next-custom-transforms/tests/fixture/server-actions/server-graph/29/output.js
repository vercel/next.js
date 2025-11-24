/* __next_internal_action_entry_do_not_use__ {"40c18c215a6b7cdc64bf709f3a714ffdef1bf9651d":"default"} */ import { registerServerReference } from "private-next-rsc-server-reference";
export const dec = async (value)=>{
    return value - 1;
};
// Test case for https://github.com/vercel/next.js/issues/54655
export default dec;
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    dec
]);
registerServerReference(dec, "40c18c215a6b7cdc64bf709f3a714ffdef1bf9651d", null);
