/* __next_internal_action_entry_do_not_use__ {"6090b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1","e03128060c414d59f8552e4788b846c0d2b7f74743":"$$RSC_SERVER_CACHE_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { Form } from 'components';
export var $$RSC_SERVER_CACHE_0 = $$cache__("default", "e03128060c414d59f8552e4788b846c0d2b7f74743", 2, async function cache([$$ACTION_ARG_0, $$ACTION_ARG_1], e) {
    const f = $$ACTION_ARG_0 + e;
    return [
        f,
        {
            a: $$ACTION_ARG_1
        }
    ];
});
registerServerReference($$RSC_SERVER_CACHE_0, "e03128060c414d59f8552e4788b846c0d2b7f74743", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_0, "name", {
    value: "cache",
    writable: false
});
export const $$RSC_SERVER_ACTION_1 = async function action($$ACTION_CLOSURE_BOUND, c) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("6090b5db271335765a4b0eab01f044b381b5ebd5cd", $$ACTION_CLOSURE_BOUND);
    const d = $$ACTION_ARG_0 + $$ACTION_ARG_1 + c;
    var cache = $$RSC_SERVER_CACHE_0.bind(null, encryptActionBoundArgs("e03128060c414d59f8552e4788b846c0d2b7f74743", d, $$ACTION_ARG_0));
    return cache(d);
};
registerServerReference($$RSC_SERVER_ACTION_1, "6090b5db271335765a4b0eab01f044b381b5ebd5cd", null);
async function Component({ a }) {
    const b = 1;
    var action = $$RSC_SERVER_ACTION_1.bind(null, encryptActionBoundArgs("6090b5db271335765a4b0eab01f044b381b5ebd5cd", a, b));
    return <Form action={action}>
      <button>Submit</button>
    </Form>;
}
