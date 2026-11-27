import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export const $$RSC_SERVER_ACTION_0 = /*#__PURE__*/ registerServerReference(async function runAction($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    return $$ACTION_ARG_0;
}, "406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
/* __next_internal_action_entry_do_not_use__ {"406a88810ecce4a4e8b59d53b8327d7e98bbf251d7":{"name":"$$RSC_SERVER_ACTION_0"}} */ export function ActionBeforeCapturedInit() {
    var runAction = $$RSC_SERVER_ACTION_0.bind(null, encryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", a));
    const ref = runAction;
    let a = 2;
    return ref;
}
