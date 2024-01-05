/* __next_internal_action_entry_do_not_use__ {"c18c215a6b7cdc64bf709f3a714ffdef1bf9651d":"default","f14702b5a021dd117f7ec7a3c838f397c2046d3b":"action"} */ import { createActionProxy } from "private-next-rsc-action-proxy";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { validator } from 'auth';
export const action = validator(async ()=>{});
export default $$ACTION_0 = validator(async ()=>{});
var $$ACTION_0;
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    action,
    $$ACTION_0
]);
createActionProxy("f14702b5a021dd117f7ec7a3c838f397c2046d3b", action);
createActionProxy("c18c215a6b7cdc64bf709f3a714ffdef1bf9651d", $$ACTION_0);
