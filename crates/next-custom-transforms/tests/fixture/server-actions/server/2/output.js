/* __next_internal_action_entry_do_not_use__ {"6a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","90b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
var myAction = registerServerReference($$RSC_SERVER_ACTION_0, "6a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
export async function $$RSC_SERVER_ACTION_0(a, b, c) {
    console.log('a');
}
export default function Page() {
    return <Button action={myAction}>Delete</Button>;
}
export const action = withValidate(registerServerReference($$RSC_SERVER_ACTION_1, "90b5db271335765a4b0eab01f044b381b5ebd5cd", null));
export async function $$RSC_SERVER_ACTION_1() {}
