/* __next_internal_action_entry_do_not_use__ {"6a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","90b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export default function Page({ foo, x, y }) {
    var action = registerServerReference($$RSC_SERVER_ACTION_0, "6a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null).bind(null, encryptActionBoundArgs("6a88810ecce4a4e8b59d53b8327d7e98bbf251d7", [
        x
    ]));
    action.bind(null, foo[0], foo[1], foo.x, foo[y]);
    const action2 = registerServerReference($$RSC_SERVER_ACTION_1,"90b5db271335765a4b0eab01f044b381b5ebd5cd", null).bind(null, encryptActionBoundArgs("90b5db271335765a4b0eab01f044b381b5ebd5cd", [
        x
    ]));
    action2.bind(null, foo[0], foo[1], foo.x, foo[y]);
}
export async function $$RSC_SERVER_ACTION_0($$ACTION_CLOSURE_BOUND, a, b, c, d) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("6a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    console.log(a, b, $$ACTION_ARG_0, c, d);
}
export async function $$RSC_SERVER_ACTION_1($$ACTION_CLOSURE_BOUND, a, b, c, d) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("90b5db271335765a4b0eab01f044b381b5ebd5cd", $$ACTION_CLOSURE_BOUND);
    console.log(a, b, $$ACTION_ARG_0, c, d);
}
