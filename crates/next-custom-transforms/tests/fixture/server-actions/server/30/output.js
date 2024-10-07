/* __next_internal_action_entry_do_not_use__ {"0090eaf4e1f08a2d94f6be401e54a2ded399b87c":"action0","1c36b06e398c97abe5d5d7ae8c672bfddf4e1b91":"$$RSC_SERVER_ACTION_2","6a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","90b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
let a, f;
export async function action0(b, c, ...g) {
    return registerServerReference($$RSC_SERVER_ACTION_2, "1c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", null).bind(null, encryptActionBoundArgs("1c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", [
        b,
        c,
        g
    ]));
}
export async function $$RSC_SERVER_ACTION_0($$ACTION_CLOSURE_BOUND, e) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2, $$ACTION_ARG_3] = await decryptActionBoundArgs("6a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    console.log(a, $$ACTION_ARG_0, $$ACTION_ARG_1, e, $$ACTION_ARG_2, $$ACTION_ARG_3);
}
export async function $$RSC_SERVER_ACTION_1($$ACTION_CLOSURE_BOUND, e) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("90b5db271335765a4b0eab01f044b381b5ebd5cd", $$ACTION_CLOSURE_BOUND);
    $$ACTION_ARG_0(e);
    console.log(a, $$ACTION_ARG_1, $$ACTION_ARG_2, e);
}
export async function $$RSC_SERVER_ACTION_2($$ACTION_CLOSURE_BOUND, d) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("1c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", $$ACTION_CLOSURE_BOUND);
    let f;
    console.log(...window, {
        window
    });
    console.log(a, $$ACTION_ARG_0, action2);
    var action2 = registerServerReference($$RSC_SERVER_ACTION_0, "6a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null).bind(null, encryptActionBoundArgs("6a88810ecce4a4e8b59d53b8327d7e98bbf251d7", [
        $$ACTION_ARG_1,
        d,
        f,
        $$ACTION_ARG_2
    ]));
    return [
        action2,
        registerServerReference($$RSC_SERVER_ACTION_1, "90b5db271335765a4b0eab01f044b381b5ebd5cd", null).bind(null, encryptActionBoundArgs("90b5db271335765a4b0eab01f044b381b5ebd5cd", [
            action2,
            $$ACTION_ARG_1,
            d
        ]))
    ];
}
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    action0
]);
registerServerReference(action0, "0090eaf4e1f08a2d94f6be401e54a2ded399b87c", null);
