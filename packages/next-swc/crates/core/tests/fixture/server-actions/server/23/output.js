/* __next_internal_action_entry_do_not_use__ {"6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0","9878bfa39811ca7650992850a8751f9591b6a557":"$$ACTION_2"} */ import { createActionProxy, encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-proxy";
export default function Page({ foo, x, y }) {
    async function action(...args) {
        return $$ACTION_0.apply(null, (action.$$bound || []).concat(args));
    }
    createActionProxy("6d53ce510b2e36499b8f56038817b9bad86cabb4", [
        encryptActionBoundArgs([
            x
        ])
    ], action, $$ACTION_0);
    action.bind(null, foo[0], foo[1], foo.x, foo[y]);
    const action2 = ($$ACTION_1 = async (...args)=>$$ACTION_2.apply(null, ($$ACTION_1.$$bound || []).concat(args)), createActionProxy("9878bfa39811ca7650992850a8751f9591b6a557", [
        encryptActionBoundArgs([
            x
        ])
    ], $$ACTION_1, $$ACTION_2), $$ACTION_1);
    action2.bind(null, foo[0], foo[1], foo.x, foo[y]);
}
export async function $$ACTION_0($$ACTION_CLOSURE_BOUND, a, b, c, d) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs($$ACTION_CLOSURE_BOUND);
    console.log(a, b, $$ACTION_ARG_0, c, d);
}
$$ACTION_0.$$closure_args = 1;
export var $$ACTION_2 = async ($$ACTION_CLOSURE_BOUND, a, b, c, d)=>{
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs($$ACTION_CLOSURE_BOUND);
    console.log(a, b, $$ACTION_ARG_0, c, d);
};
$$ACTION_2.$$closure_args = 1;
var $$ACTION_1;
