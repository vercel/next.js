/* __next_internal_action_entry_do_not_use__ {"803128060c414d59f8552e4788b846c0d2b7f74743":"$$RSC_SERVER_CACHE_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
// Expect no error here, this is allowed to be sync because it's not exported.
function Foo() {
    const v = Math.random();
    console.log(v);
    return v;
}
export var $$RSC_SERVER_CACHE_0 = $$cache__("default", "803128060c414d59f8552e4788b846c0d2b7f74743", 0, async function bar() {
    return <Foo/>;
});
Object["defineProperty"]($$RSC_SERVER_CACHE_0, "name", {
    value: "bar",
    writable: false
});
export var bar = registerServerReference($$RSC_SERVER_CACHE_0, "803128060c414d59f8552e4788b846c0d2b7f74743", null);
