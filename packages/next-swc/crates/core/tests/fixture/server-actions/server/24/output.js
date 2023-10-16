/* __next_internal_action_entry_do_not_use__ {"6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0"} */ import { createActionProxy, encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-proxy";
export default function Page({ foo, x, y }) {
    async function action(...args) {
        return $$ACTION_0.apply(null, (action.$$bound || []).concat(args));
    }
    createActionProxy("6d53ce510b2e36499b8f56038817b9bad86cabb4", [
        encryptActionBoundArgs([
            foo
        ])
    ], action, $$ACTION_0);
}
export async function $$ACTION_0($$ACTION_CLOSURE_BOUND, a, b, c, { d }) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs($$ACTION_CLOSURE_BOUND);
    console.log(a, b, $$ACTION_ARG_0, d);
}
$$ACTION_0.$$closure_args = 1;
