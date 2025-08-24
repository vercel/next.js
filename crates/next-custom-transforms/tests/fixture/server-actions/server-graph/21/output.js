/* __next_internal_action_entry_do_not_use__ {"001c36b06e398c97abe5d5d7ae8c672bfddf4e1b91":"$$RSC_SERVER_ACTION_2","0090b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1","606a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { validator, another } from 'auth';
import { Button } from 'components';
const x = 1;
export const $$RSC_SERVER_ACTION_0 = async function($$ACTION_CLOSURE_BOUND, z) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("606a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    return x + $$ACTION_ARG_0 + z;
};
registerServerReference($$RSC_SERVER_ACTION_0, "606a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
export default function Page() {
    const y = 1;
    return <Button // TODO: should use `action` as function name?
    action={validator($$RSC_SERVER_ACTION_0.bind(null, encryptActionBoundArgs("606a88810ecce4a4e8b59d53b8327d7e98bbf251d7", y)))}/>;
}
export const $$RSC_SERVER_ACTION_1 = async function() {};
registerServerReference($$RSC_SERVER_ACTION_1, "0090b5db271335765a4b0eab01f044b381b5ebd5cd", null);
validator($$RSC_SERVER_ACTION_1);
export const $$RSC_SERVER_ACTION_2 = async function() {};
registerServerReference($$RSC_SERVER_ACTION_2, "001c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", null);
another(validator($$RSC_SERVER_ACTION_2));
