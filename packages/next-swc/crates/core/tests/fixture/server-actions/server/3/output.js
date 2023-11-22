// app/send.ts
/* __next_internal_action_entry_do_not_use__ {"e10665baac148856374b2789aceb970f66fec33e":"myAction"} */ import { createActionProxy } from "private-next-rsc-action-proxy";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export async function myAction(a, b, c) {
    console.log('a');
}
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    myAction
]);
createActionProxy("e10665baac148856374b2789aceb970f66fec33e", myAction);
