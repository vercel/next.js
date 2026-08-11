import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
/* __next_internal_action_entry_do_not_use__ {"606a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0"} */ import { Client } from 'components';
export const $$RSC_SERVER_ACTION_0 = async function closedOverDefaultArgValue($$ACTION_CLOSURE_BOUND, x = value) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("606a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    return x;
};
registerServerReference($$RSC_SERVER_ACTION_0, "606a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
export function Component() {
    const value = 3;
    // `value` is not referenced in the closure's body, but it's used as
    // the default value for `x`, so it still needs to be available
    const closedOverDefaultArgValue = $$RSC_SERVER_ACTION_0.bind(null, encryptActionBoundArgs("606a88810ecce4a4e8b59d53b8327d7e98bbf251d7", value));
    return <Client action={closedOverDefaultArgValue}/>;
}
