/* __next_internal_action_entry_do_not_use__ {"7fc18c215a6b7cdc64bf709f3a714ffdef1bf9651d":"default","7ff14702b5a021dd117f7ec7a3c838f397c2046d3b":"action"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { validator } from 'auth';
export const action = validator(async ()=>{});
const $$RSC_SERVER_ACTION_0 = validator(async ()=>{});
export default $$RSC_SERVER_ACTION_0;
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    $$RSC_SERVER_ACTION_0,
    action
]);
registerServerReference($$RSC_SERVER_ACTION_0, "7fc18c215a6b7cdc64bf709f3a714ffdef1bf9651d", null);
registerServerReference(action, "7ff14702b5a021dd117f7ec7a3c838f397c2046d3b", null);
