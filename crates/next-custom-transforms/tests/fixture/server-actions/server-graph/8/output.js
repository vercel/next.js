/*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ /* __next_internal_action_entry_do_not_use__ {"706a88810ecce4a4e8b59d53b8327d7e98bbf251d7":{"exported":"$$RSC_SERVER_ACTION_0","original":"myAction","span":{"start":1,"end":99}}} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export const $$RSC_SERVER_ACTION_0 = async function myAction(a, b, c) {
    // comment
    'use strict';
    console.log('a');
};
var myAction = registerServerReference($$RSC_SERVER_ACTION_0, "706a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
export default function Page() {
    return <Button action={myAction}>Delete</Button>;
}
