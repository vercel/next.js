/* __next_internal_action_entry_do_not_use__ {"406a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import ANYTHING from 'anything';
import f, { f1, f2 } from 'foo';
import { Button } from 'components';
const f3 = 1;
var f4;
let f5;
const [f6, [f7, ...f8], { f9 }, { f10, f11: [f12], f13: f14, f15: { f16 }, ...f17 }, ...f18] = ANYTHING;
if (true) {
    const g191 = 1;
}
function x() {
    const f2 = 1;
    const g201 = 1;
}
export const $$RSC_SERVER_ACTION_0 = async function action($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2, $$ACTION_ARG_3, $$ACTION_ARG_4, $$ACTION_ARG_5] = await decryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    const f17 = 1;
    if (true) {
        const f18 = 1;
        const f19 = 1;
    }
    console.log(f, f1, $$ACTION_ARG_0, f3, f4, f5, f6, f7, f8, $$ACTION_ARG_0(f9), f12, $$ACTION_ARG_1, f16.x, f17, f18, $$ACTION_ARG_2, $$ACTION_ARG_3, $$ACTION_ARG_4, $$ACTION_ARG_5, // @ts-expect-error: deliberately undefined variable
    g19, // @ts-expect-error: deliberately undefined variable
    g20, globalThis);
};
registerServerReference($$RSC_SERVER_ACTION_0, "406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
export function y(p, [p1, { p2 }], ...p3) {
    /** @type {any} */ const f2 = 1;
    const f11 = 1;
    const f19 = 1;
    if (true) {
        const f8 = 1;
    }
    var action = $$RSC_SERVER_ACTION_0.bind(null, encryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", f2, f11, p, p1, p2, p3));
    return <Button action={action}>Delete</Button>;
}
