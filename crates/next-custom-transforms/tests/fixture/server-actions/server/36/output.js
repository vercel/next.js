/* __next_internal_action_entry_do_not_use__ {"3128060c414d59f8552e4788b846c0d2b7f74743":"$$RSC_SERVER_CACHE_0","951c375b4a6a6e89d67b743ec5808127cfde405d":"$$RSC_SERVER_CACHE_1"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
export var $$RSC_SERVER_CACHE_0 = $$cache__("default", "3128060c414d59f8552e4788b846c0d2b7f74743", async function foo() {
    return 'data A';
});
export var foo = registerServerReference($$RSC_SERVER_CACHE_0, "3128060c414d59f8552e4788b846c0d2b7f74743", null);
export var $$RSC_SERVER_CACHE_1 = $$cache__("default", "951c375b4a6a6e89d67b743ec5808127cfde405d", async function bar() {
    return 'data B';
});
export var bar = registerServerReference($$RSC_SERVER_CACHE_1, "951c375b4a6a6e89d67b743ec5808127cfde405d", null);
