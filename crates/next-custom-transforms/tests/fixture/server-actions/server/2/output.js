/*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ /* __next_internal_action_entry_do_not_use__ {"0090b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1","706a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export const $$RSC_SERVER_ACTION_0 = async function myAction(a, b, c) {
    console.log('a');
};
var myAction = registerServerReference($$RSC_SERVER_ACTION_0, "706a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
export default function Page() {
    return <Button action={myAction}>Delete</Button>;
}
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_1 = async function() {};
// TODO: should use `action` as function name?
export const action = withValidate(registerServerReference($$RSC_SERVER_ACTION_1, "0090b5db271335765a4b0eab01f044b381b5ebd5cd", null));
