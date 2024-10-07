/* __next_internal_action_entry_do_not_use__ {"1c36b06e398c97abe5d5d7ae8c672bfddf4e1b91":"$$RSC_SERVER_ACTION_2","6a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","c18c215a6b7cdc64bf709f3a714ffdef1bf9651d":"default","f14702b5a021dd117f7ec7a3c838f397c2046d3b":"action"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { validator } from 'auth';
export const action = validator(registerServerReference($$RSC_SERVER_ACTION_0, "6a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null));
export async function $$RSC_SERVER_ACTION_0() {}
export default $$RSC_SERVER_ACTION_1 = validator(registerServerReference($$RSC_SERVER_ACTION_2, "1c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", null));
var $$RSC_SERVER_ACTION_1;
export async function $$RSC_SERVER_ACTION_2() {}
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    action,
    $$RSC_SERVER_ACTION_1
]);
registerServerReference(action, "f14702b5a021dd117f7ec7a3c838f397c2046d3b", null);
registerServerReference($$RSC_SERVER_ACTION_1, "c18c215a6b7cdc64bf709f3a714ffdef1bf9651d", null);
