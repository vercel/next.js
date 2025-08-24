/* __next_internal_action_entry_do_not_use__ {"706a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { Button } from 'components';
export const $$RSC_SERVER_ACTION_0 = async function myAction(a, b, c) {
    // comment
    'use strict';
    console.log('a');
};
registerServerReference($$RSC_SERVER_ACTION_0, "706a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
var myAction = $$RSC_SERVER_ACTION_0;
export default function Page() {
    return <Button action={myAction}>Delete</Button>;
}
