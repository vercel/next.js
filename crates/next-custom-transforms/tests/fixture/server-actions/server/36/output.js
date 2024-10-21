/* __next_internal_action_entry_do_not_use__ {"3128060c414d59f8552e4788b846c0d2b7f74743":"$$RSC_SERVER_CACHE_0","4acc55633206134002149ce873fe498be64a6fef":"$$RSC_SERVER_CACHE_4","69348c79fce073bae2f70f139565a2fda1c74c74":"$$RSC_SERVER_CACHE_2","951c375b4a6a6e89d67b743ec5808127cfde405d":"$$RSC_SERVER_CACHE_1"} */ import { registerServerReference } from "private-next-rsc-server-reference";
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
export var $$RSC_SERVER_CACHE_2 = $$cache__("default", "69348c79fce073bae2f70f139565a2fda1c74c74", async function Cached({ children }) {
    return children;
});
export default registerServerReference($$RSC_SERVER_CACHE_2, "69348c79fce073bae2f70f139565a2fda1c74c74", null);
export var $$RSC_SERVER_CACHE_4 = $$cache__("default", "4acc55633206134002149ce873fe498be64a6fef", async function $$RSC_SERVER_CACHE_3() {
    return 'data C';
});
export const baz = registerServerReference($$RSC_SERVER_CACHE_4, "4acc55633206134002149ce873fe498be64a6fef", null);
