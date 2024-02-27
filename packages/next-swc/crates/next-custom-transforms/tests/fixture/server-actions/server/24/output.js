/* __next_internal_action_entry_do_not_use__ {"6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export default function Page({ foo, x, y }) {
    var action = registerServerReference("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_0).bind(null, encryptActionBoundArgs("6d53ce510b2e36499b8f56038817b9bad86cabb4", [
        foo
    ]));
}
export async function $$ACTION_0($$ACTION_CLOSURE_BOUND, a, b, c, { d }) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_CLOSURE_BOUND);
    console.log(a, b, $$ACTION_ARG_0, d);
}
