/* __next_internal_action_entry_do_not_use__ {"601c36b06e398c97abe5d5d7ae8c672bfddf4e1b91":"$$RSC_SERVER_ACTION_2","606a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","6090b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
let a, f;
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_0 = async function action2($$ACTION_CLOSURE_BOUND, e) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2, $$ACTION_ARG_3] = await decryptActionBoundArgs("606a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    console.log(a, $$ACTION_ARG_0, $$ACTION_ARG_1, e, $$ACTION_ARG_2, $$ACTION_ARG_3);
};
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_1 = async function action3($$ACTION_CLOSURE_BOUND, e) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("6090b5db271335765a4b0eab01f044b381b5ebd5cd", $$ACTION_CLOSURE_BOUND);
    $$ACTION_ARG_0(e);
    console.log(a, $$ACTION_ARG_1, $$ACTION_ARG_2, e);
};
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_2 = async function action1($$ACTION_CLOSURE_BOUND, d) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("601c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", $$ACTION_CLOSURE_BOUND);
    let f;
    console.log(...window, {
        window
    });
    console.log(a, $$ACTION_ARG_0, action2);
    var action2 = registerServerReference($$RSC_SERVER_ACTION_0, "606a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null).bind(null, encryptActionBoundArgs("606a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_ARG_1, d, f, $$ACTION_ARG_2));
    return [
        action2,
        registerServerReference($$RSC_SERVER_ACTION_1, "6090b5db271335765a4b0eab01f044b381b5ebd5cd", null).bind(null, encryptActionBoundArgs("6090b5db271335765a4b0eab01f044b381b5ebd5cd", action2, $$ACTION_ARG_1, d))
    ];
};
function Comp(b, c, ...g) {
    return registerServerReference($$RSC_SERVER_ACTION_2, "601c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", null).bind(null, encryptActionBoundArgs("601c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", b, c, g));
}
