/* __next_internal_action_entry_do_not_use__ {"7f28baf972d345b86b747ad0df73d75a0088a42214":{"exported":"dec","original":"dec","span":null},"7fc18c215a6b7cdc64bf709f3a714ffdef1bf9651d":{"exported":"default","original":"dec","span":null}} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ dec = async (value)=>{
    return value - 1;
};
// Test case for https://github.com/vercel/next.js/issues/54655
export default /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ dec;
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    dec,
    dec
]);
registerServerReference(dec, "7f28baf972d345b86b747ad0df73d75a0088a42214", null);
registerServerReference(dec, "7fc18c215a6b7cdc64bf709f3a714ffdef1bf9651d", null);
