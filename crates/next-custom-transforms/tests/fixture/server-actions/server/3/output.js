// app/send.ts
/* __next_internal_action_entry_do_not_use__ {"70e10665baac148856374b2789aceb970f66fec33e":"myAction"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export async function /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ myAction(a, b, c) {
    console.log('a');
}
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    myAction
]);
registerServerReference(myAction, "70e10665baac148856374b2789aceb970f66fec33e", null);
