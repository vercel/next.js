// app/send.ts
/* __next_internal_action_entry_do_not_use__ myAction */ import __create_action_proxy__ from "private-next-rsc-action-proxy";
export async function myAction(a, b, c) {
    console.log('a');
}
import ensureServerEntryExports from "private-next-rsc-action-validate";
ensureServerEntryExports([
    myAction
]);
__create_action_proxy__("e10665baac148856374b2789aceb970f66fec33e", null, myAction);
