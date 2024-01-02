/* __next_internal_action_entry_do_not_use__ {"6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0","9878bfa39811ca7650992850a8751f9591b6a557":"$$ACTION_2"} */ import { createActionProxy } from "private-next-rsc-action-proxy";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export default function Page({ foo, x, y }) {
    function action() {}
    createActionProxy("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_0).bind(null, encryptActionBoundArgs("6d53ce510b2e36499b8f56038817b9bad86cabb4", [
        x
    ])).bind(null, foo[0], foo[1], foo.x, foo[y]);
    const action2 = createActionProxy("9878bfa39811ca7650992850a8751f9591b6a557", $$ACTION_2).bind(null, encryptActionBoundArgs("9878bfa39811ca7650992850a8751f9591b6a557", [
        x
    ]));
    action2.bind(null, foo[0], foo[1], foo.x, foo[y]);
}
export async function $$ACTION_0($$ACTION_CLOSURE_BOUND, a, b, c, d) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_CLOSURE_BOUND);
    console.log(a, b, $$ACTION_ARG_0, c, d);
}
export async function $$ACTION_2($$ACTION_CLOSURE_BOUND, a, b, c, d) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("9878bfa39811ca7650992850a8751f9591b6a557", $$ACTION_CLOSURE_BOUND);
    console.log(a, b, $$ACTION_ARG_0, c, d);
}
