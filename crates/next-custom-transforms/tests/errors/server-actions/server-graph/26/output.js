/* __next_internal_action_entry_do_not_use__ {"803128060c414d59f8552e4788b846c0d2b7f74743":"$$RSC_SERVER_CACHE_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
export var $$RSC_SERVER_CACHE_0 = $$cache__("default", "803128060c414d59f8552e4788b846c0d2b7f74743", 0, /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ async function bar() {
    // arguments is not allowed here
    console.log(arguments);
    // this is not allowed here
    return this.foo();
});
Object.defineProperty($$RSC_SERVER_CACHE_0, "name", {
    "value": "bar",
    "writable": false
});
export class MyClass {
    static async foo() {
        return fetch('https://example.com').then((res)=>res.json());
    }
    static bar = registerServerReference($$RSC_SERVER_CACHE_0, "803128060c414d59f8552e4788b846c0d2b7f74743", null);
}
