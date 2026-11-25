import { registerServerReference, bindServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
/* __next_internal_action_entry_do_not_use__ {"6090b5db271335765a4b0eab01f044b381b5ebd5cd":{"name":"$$RSC_SERVER_ACTION_1"},"e03128060c414d59f8552e4788b846c0d2b7f74743":{"name":"$$RSC_SERVER_CACHE_0"}} */ import { Form } from 'components';
const $$RSC_SERVER_CACHE_0_INNER = async function cache([$$ACTION_ARG_0, $$ACTION_ARG_1], e) {
    const f = $$ACTION_ARG_0 + e;
    return [
        f,
        {
            a: $$ACTION_ARG_1
        }
    ];
};
export var $$RSC_SERVER_CACHE_0 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function cache() {
    return $$cache__("default", "e03128060c414d59f8552e4788b846c0d2b7f74743", 2, $$RSC_SERVER_CACHE_0_INNER, Array.prototype.slice.call(arguments, 0, 2));
}), "e03128060c414d59f8552e4788b846c0d2b7f74743", null), "name", {
    value: "cache"
});
export const $$RSC_SERVER_ACTION_1 = /*#__PURE__*/ registerServerReference(async function action($$ACTION_CLOSURE_BOUND, c) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("6090b5db271335765a4b0eab01f044b381b5ebd5cd", $$ACTION_CLOSURE_BOUND);
    var cache = /*#__PURE__*/ bindServerReference($$RSC_SERVER_CACHE_0, ()=>encryptActionBoundArgs("e03128060c414d59f8552e4788b846c0d2b7f74743", d, $$ACTION_ARG_0));
    const d = $$ACTION_ARG_0 + $$ACTION_ARG_1 + c;
    return cache(d);
}, "6090b5db271335765a4b0eab01f044b381b5ebd5cd", null);
async function Component({ a }) {
    var action = /*#__PURE__*/ bindServerReference($$RSC_SERVER_ACTION_1, ()=>encryptActionBoundArgs("6090b5db271335765a4b0eab01f044b381b5ebd5cd", a, b));
    const b = 1;
    return <Form action={action}>
      <button>Submit</button>
    </Form>;
}
