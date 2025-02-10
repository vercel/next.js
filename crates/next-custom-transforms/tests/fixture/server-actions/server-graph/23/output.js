/* __next_internal_action_entry_do_not_use__ {"7c6a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","7c90b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_0 = async function action($$ACTION_CLOSURE_BOUND, a, b, c, d) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("7c6a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    console.log(a, b, $$ACTION_ARG_0, c, d);
};
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_1 = async function action2($$ACTION_CLOSURE_BOUND, a, b, c, d) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("7c90b5db271335765a4b0eab01f044b381b5ebd5cd", $$ACTION_CLOSURE_BOUND);
    console.log(a, b, $$ACTION_ARG_0, c, d);
};
export default function Page({ foo, x, y }) {
    var action = registerServerReference($$RSC_SERVER_ACTION_0, "7c6a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null).bind(null, encryptActionBoundArgs("7c6a88810ecce4a4e8b59d53b8327d7e98bbf251d7", x));
    action.bind(null, foo[0], foo[1], foo.x, foo[y]);
    const action2 = registerServerReference($$RSC_SERVER_ACTION_1, "7c90b5db271335765a4b0eab01f044b381b5ebd5cd", null).bind(null, encryptActionBoundArgs("7c90b5db271335765a4b0eab01f044b381b5ebd5cd", x));
    action2.bind(null, foo[0], foo[1], foo.x, foo[y]);
}
