/* __next_internal_action_entry_do_not_use__ {"803128060c414d59f8552e4788b846c0d2b7f74743":"$$RSC_SERVER_CACHE_0","80951c375b4a6a6e89d67b743ec5808127cfde405d":"$$RSC_SERVER_CACHE_1"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
export var $$RSC_SERVER_CACHE_0 = $$cache__("default", "803128060c414d59f8552e4788b846c0d2b7f74743", 0, async function() {});
Object.defineProperty($$RSC_SERVER_CACHE_0, "name", {
    "value": "foo",
    "writable": false
});
const foo = /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ registerServerReference($$RSC_SERVER_CACHE_0, "803128060c414d59f8552e4788b846c0d2b7f74743", null);
export var $$RSC_SERVER_CACHE_1 = $$cache__("default", "80951c375b4a6a6e89d67b743ec5808127cfde405d", 0, /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ async function bar() {
    return foo();
});
Object.defineProperty($$RSC_SERVER_CACHE_1, "name", {
    "value": "bar",
    "writable": false
});
export var bar = registerServerReference($$RSC_SERVER_CACHE_1, "80951c375b4a6a6e89d67b743ec5808127cfde405d", null);
