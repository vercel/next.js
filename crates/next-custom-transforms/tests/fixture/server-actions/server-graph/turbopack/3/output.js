// app/send.ts
import { registerServerReference } from "private-next-rsc-server-reference";
export async function myAction(a, b, c) {
    console.log('a');
}
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    myAction
]);
registerServerReference(myAction, "70e10665baac148856374b2789aceb970f66fec33e", null);
__turbopack_emit__("./item.js", {
    namespace: 'next/server-actions',
    data: "70e10665baac148856374b2789aceb970f66fec33e|myAction"
});
