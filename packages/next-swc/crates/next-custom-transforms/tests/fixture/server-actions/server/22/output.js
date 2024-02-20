/* __next_internal_action_entry_do_not_use__ {"6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0","9878bfa39811ca7650992850a8751f9591b6a557":"$$ACTION_2","c18c215a6b7cdc64bf709f3a714ffdef1bf9651d":"default","f14702b5a021dd117f7ec7a3c838f397c2046d3b":"action"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { validator } from 'auth';
export const action = validator(registerServerReference("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_0));
export async function $$ACTION_0() {}
export default $$ACTION_1 = validator(registerServerReference("9878bfa39811ca7650992850a8751f9591b6a557", $$ACTION_2));
var $$ACTION_1;
export async function $$ACTION_2() {}
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    action,
    $$ACTION_1
]);
registerServerReference("f14702b5a021dd117f7ec7a3c838f397c2046d3b", action);
registerServerReference("c18c215a6b7cdc64bf709f3a714ffdef1bf9651d", $$ACTION_1);
