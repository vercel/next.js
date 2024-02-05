/* __next_internal_action_entry_do_not_use__ {"188d5d945750dc32e2c842b93c75a65763d4a922":"$$ACTION_1","6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0"} */ import { createActionProxy } from "private-next-rsc-action-proxy";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
var myAction = createActionProxy("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_0);
export async function $$ACTION_0(a, b, c) {
    console.log('a');
}
export default function Page() {
    return <Button action={myAction}>Delete</Button>;
}
export const action = withValidate(createActionProxy("188d5d945750dc32e2c842b93c75a65763d4a922", $$ACTION_1));
export async function $$ACTION_1() {}
