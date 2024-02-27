/* __next_internal_action_entry_do_not_use__ {"0090eaf4e1f08a2d94f6be401e54a2ded399b87c":"action0","188d5d945750dc32e2c842b93c75a65763d4a922":"$$ACTION_1","6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0","9878bfa39811ca7650992850a8751f9591b6a557":"$$ACTION_2"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
let a, f;
export async function action0(b, c, ...g) {
    return registerServerReference("9878bfa39811ca7650992850a8751f9591b6a557", $$ACTION_2).bind(null, encryptActionBoundArgs("9878bfa39811ca7650992850a8751f9591b6a557", [
        c,
        g,
        b
    ]));
}
export async function $$ACTION_0($$ACTION_CLOSURE_BOUND, e) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2, $$ACTION_ARG_3] = await decryptActionBoundArgs("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_CLOSURE_BOUND);
    console.log(a, $$ACTION_ARG_0, $$ACTION_ARG_1, e, $$ACTION_ARG_2, $$ACTION_ARG_3);
}
export async function $$ACTION_1($$ACTION_CLOSURE_BOUND, e) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("188d5d945750dc32e2c842b93c75a65763d4a922", $$ACTION_CLOSURE_BOUND);
    $$ACTION_ARG_0(e);
    console.log(a, $$ACTION_ARG_1, $$ACTION_ARG_2, e);
}
export async function $$ACTION_2($$ACTION_CLOSURE_BOUND, d) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("9878bfa39811ca7650992850a8751f9591b6a557", $$ACTION_CLOSURE_BOUND);
    let f;
    console.log(...window, {
        window
    });
    console.log(a, $$ACTION_ARG_2, action2);
    var action2 = registerServerReference("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_0).bind(null, encryptActionBoundArgs("6d53ce510b2e36499b8f56038817b9bad86cabb4", [
        $$ACTION_ARG_0,
        d,
        f,
        $$ACTION_ARG_1
    ]));
    return [
        action2,
        registerServerReference("188d5d945750dc32e2c842b93c75a65763d4a922", $$ACTION_1).bind(null, encryptActionBoundArgs("188d5d945750dc32e2c842b93c75a65763d4a922", [
            action2,
            $$ACTION_ARG_0,
            d
        ]))
    ];
}
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    action0
]);
registerServerReference("0090eaf4e1f08a2d94f6be401e54a2ded399b87c", action0);
