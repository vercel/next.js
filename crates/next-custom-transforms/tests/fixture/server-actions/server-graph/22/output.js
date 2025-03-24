/* __next_internal_action_entry_do_not_use__ {"7fc18c215a6b7cdc64bf709f3a714ffdef1bf9651d":"default","7ff14702b5a021dd117f7ec7a3c838f397c2046d3b":"action"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { validator } from 'auth';
export const action = validator(async ()=>{});
export default $$RSC_SERVER_ACTION_0 = validator(async ()=>{});
var $$RSC_SERVER_ACTION_0;
Object["defineProperty"]($$RSC_SERVER_ACTION_0, "name", {
    value: "default",
    writable: false
});
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    action,
    $$RSC_SERVER_ACTION_0
]);
registerServerReference(action, "7ff14702b5a021dd117f7ec7a3c838f397c2046d3b", null);
registerServerReference($$RSC_SERVER_ACTION_0, "7fc18c215a6b7cdc64bf709f3a714ffdef1bf9651d", null);
