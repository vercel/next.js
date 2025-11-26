/* __next_internal_action_entry_do_not_use__ {"ffab21efdafbe611287bc25c0462b1e0510d13e48b":"foo"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
// not exported!
async function a() {
    // this is allowed here
    this.foo();
    // arguments is allowed here
    console.log(arguments);
    const b = async ()=>{
        // this is not allowed here
        this.foo();
        // arguments is not allowed here
        console.log(arguments);
    };
}
const { foo } = {
    foo () {
        return 42;
    },
    bar () {
        // this is allowed here
        this.foo();
        // arguments is allowed here
        console.log(arguments);
    }
};
let $$RSC_SERVER_CACHE_foo = foo;
if (typeof foo === "function") {
    $$RSC_SERVER_CACHE_foo = $$reactCache__(function() {
        return $$cache__("default", "ffab21efdafbe611287bc25c0462b1e0510d13e48b", 0, foo, arguments);
    });
    registerServerReference($$RSC_SERVER_CACHE_foo, "ffab21efdafbe611287bc25c0462b1e0510d13e48b", null);
    Object["defineProperty"]($$RSC_SERVER_CACHE_foo, "name", {
        value: "foo"
    });
}
export { $$RSC_SERVER_CACHE_foo as foo };
