/* __next_internal_action_entry_do_not_use__ {"c03128060c414d59f8552e4788b846c0d2b7f74743":"$$RSC_SERVER_CACHE_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
export var $$RSC_SERVER_CACHE_0 = $$cache__("default", "c03128060c414d59f8552e4788b846c0d2b7f74743", 2, async function fn([$$ACTION_ARG_0, $$ACTION_ARG_1]) {
    console.log($$ACTION_ARG_0);
    return {
        foo: $$ACTION_ARG_1
    };
});
registerServerReference($$RSC_SERVER_CACHE_0, "c03128060c414d59f8552e4788b846c0d2b7f74743", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_0, "name", {
    value: "fn",
    writable: false
});
async function Component({ foo }) {
    const a = 123;
    var fn = $$RSC_SERVER_CACHE_0.bind(null, encryptActionBoundArgs("c03128060c414d59f8552e4788b846c0d2b7f74743", a, foo));
    const data = await fn();
    // @ts-expect-error: data is not a valid react child
    return <div>{data}</div>;
}
