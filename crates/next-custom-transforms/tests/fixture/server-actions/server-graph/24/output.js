/* __next_internal_action_entry_do_not_use__ {"7c6a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export const $$RSC_SERVER_ACTION_0 = async function action($$ACTION_CLOSURE_BOUND, a, b, c, { d }) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("7c6a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    console.log(a, b, $$ACTION_ARG_0, d);
};
registerServerReference($$RSC_SERVER_ACTION_0, "7c6a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
export default function Page({ foo, x, y }) {
    var action = $$RSC_SERVER_ACTION_0.bind(null, encryptActionBoundArgs("7c6a88810ecce4a4e8b59d53b8327d7e98bbf251d7", foo));
}
