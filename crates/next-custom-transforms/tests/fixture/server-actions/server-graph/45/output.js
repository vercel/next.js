/* __next_internal_action_entry_do_not_use__ {"803128060c414d59f8552e4788b846c0d2b7f74743":"$$RSC_SERVER_CACHE_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
// Expect no error here, this is allowed to be sync because it's not exported.
function Foo() {
    const v = Math.random();
    console.log(v);
    return v;
}
const $$RSC_SERVER_CACHE_0_INNER = async function bar() {
    return <Foo/>;
};
export var $$RSC_SERVER_CACHE_0 = $$reactCache__(function bar() {
    return $$cache__("default", "803128060c414d59f8552e4788b846c0d2b7f74743", 0, $$RSC_SERVER_CACHE_0_INNER, []);
});
registerServerReference($$RSC_SERVER_CACHE_0, "803128060c414d59f8552e4788b846c0d2b7f74743", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_0, "name", {
    value: "bar"
});
export var bar = $$RSC_SERVER_CACHE_0;
