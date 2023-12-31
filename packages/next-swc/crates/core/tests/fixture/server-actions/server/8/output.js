/* __next_internal_action_entry_do_not_use__ {"6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0"} */ import { createActionProxy } from "private-next-rsc-action-proxy";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
function myAction() {}
export async function $$ACTION_0(a, b, c) {
    // comment
    'use strict';
    console.log('a');
}
export default function Page() {
    return <Button action={createActionProxy("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_0)}>Delete</Button>;
}
