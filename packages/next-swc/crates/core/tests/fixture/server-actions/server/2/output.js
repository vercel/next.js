/* __next_internal_action_entry_do_not_use__ {"6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0","9878bfa39811ca7650992850a8751f9591b6a557":"$$ACTION_2"} */ import { createActionProxy } from "private-next-rsc-action-proxy";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
function myAction() {}
export async function $$ACTION_0(a, b, c) {
    console.log('a');
}
export default function Page() {
    return <Button action={createActionProxy("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_0)}>Delete</Button>;
}
export const action = withValidate(createActionProxy("9878bfa39811ca7650992850a8751f9591b6a557", $$ACTION_2));
export async function $$ACTION_2() {}
