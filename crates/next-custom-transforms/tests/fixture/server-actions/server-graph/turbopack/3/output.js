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
    namespace: process.env.NEXT_RUNTIME === 'nodejs' ? 'next/server-actions/rsc-nodejs' : 'next/server-actions/rsc-edge',
    data: "70e10665baac148856374b2789aceb970f66fec33e\0myAction\0/app/item.js"
});
