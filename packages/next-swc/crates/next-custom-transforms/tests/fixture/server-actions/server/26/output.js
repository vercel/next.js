/* __next_internal_action_entry_do_not_use__ {"6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
const noop = (action)=>action;
export const log = noop(registerServerReference("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_0));
export async function $$ACTION_0(data) {
    console.log(data);
}
