/* __next_internal_action_entry_do_not_use__ {"1c36b06e398c97abe5d5d7ae8c672bfddf4e1b91":"$$RSC_SERVER_ACTION_2","90b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1","9ed0cc47abc4e1c64320cf42b74ae60b58c40f00":"$$RSC_SERVER_ACTION_3"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { validator, another } from 'auth';
const x = 1;
export default function Page() {
    const y = 1;
    return <Foo action={validator(registerServerReference($$RSC_SERVER_ACTION_1, "90b5db271335765a4b0eab01f044b381b5ebd5cd", null).bind(null, encryptActionBoundArgs("90b5db271335765a4b0eab01f044b381b5ebd5cd", [
        y
    ])))}/>;
}
export async function $$RSC_SERVER_ACTION_1($$ACTION_CLOSURE_BOUND, z) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("90b5db271335765a4b0eab01f044b381b5ebd5cd", $$ACTION_CLOSURE_BOUND);
    return x + $$ACTION_ARG_0 + z;
}
validator(registerServerReference($$RSC_SERVER_ACTION_2, "1c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", null));
export async function $$RSC_SERVER_ACTION_2() {}
another(validator(registerServerReference($$RSC_SERVER_ACTION_3, "9ed0cc47abc4e1c64320cf42b74ae60b58c40f00", null)));
export async function $$RSC_SERVER_ACTION_3() {}
