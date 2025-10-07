/* __next_internal_action_entry_do_not_use__ {"606a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { Button } from 'components';
export const $$RSC_SERVER_ACTION_0 = async function action($$ACTION_CLOSURE_BOUND, value2) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("606a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    return $$ACTION_ARG_0 * value2;
};
registerServerReference($$RSC_SERVER_ACTION_0, "606a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
export function Item({ value }) {
    return <>
      <Button action={$$RSC_SERVER_ACTION_0.bind(null, encryptActionBoundArgs("606a88810ecce4a4e8b59d53b8327d7e98bbf251d7", value))}>
        Multiple
      </Button>
    </>;
}
