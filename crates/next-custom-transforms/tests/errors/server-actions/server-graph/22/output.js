/*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ /* __next_internal_action_entry_do_not_use__ {"006a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","8069348c79fce073bae2f70f139565a2fda1c74c74":"$$RSC_SERVER_CACHE_2","80951c375b4a6a6e89d67b743ec5808127cfde405d":"$$RSC_SERVER_CACHE_1"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_0 = async function e() {
    // this is not allowed here
    this.foo();
    // arguments is not allowed here
    console.log(arguments);
};
export var $$RSC_SERVER_CACHE_1 = $$cache__("default", "80951c375b4a6a6e89d67b743ec5808127cfde405d", 0, async function a() {
    // this is not allowed here
    this.foo();
    // arguments is not allowed here
    console.log(arguments);
    const b = async ()=>{
        // this is not allowed here
        this.foo();
        // arguments is not allowed here
        console.log(arguments);
    };
    function c() {
        // this is allowed here
        this.foo();
        // arguments is allowed here
        console.log(arguments);
        const d = ()=>{
            // this is allowed here
            this.foo();
            // arguments is allowed here
            console.log(arguments);
        };
        const e = registerServerReference($$RSC_SERVER_ACTION_0, "006a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
    }
});
Object.defineProperty($$RSC_SERVER_CACHE_1, "name", {
    "value": "a",
    "writable": false
});
var a = registerServerReference($$RSC_SERVER_CACHE_1, "80951c375b4a6a6e89d67b743ec5808127cfde405d", null);
export var $$RSC_SERVER_CACHE_2 = $$cache__("default", "8069348c79fce073bae2f70f139565a2fda1c74c74", 0, /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ async function fetch1() {
    // this is not allowed here
    this.result = await fetch('https://example.com').then((res)=>res.json());
    // arguments is not allowed here
    console.log(arguments);
});
Object.defineProperty($$RSC_SERVER_CACHE_2, "name", {
    "value": "fetch",
    "writable": false
});
export const api = {
    result: null,
    product: {
        fetch: registerServerReference($$RSC_SERVER_CACHE_2, "8069348c79fce073bae2f70f139565a2fda1c74c74", null)
    }
};
