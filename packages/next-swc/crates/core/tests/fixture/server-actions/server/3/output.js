// app/send.ts
/* __next_internal_action_entry_do_not_use__ myAction */ export async function myAction(a, b, c) {
    console.log('a');
}
import ensureServerEntryExports from "private-next-rsc-action-proxy";
ensureServerEntryExports([
    myAction
]);
myAction.$$typeof = Symbol.for("react.server.reference");
myAction.$$id = "e10665baac148856374b2789aceb970f66fec33e";
myAction.$$bound = [];
myAction.$$with_bound = false;
