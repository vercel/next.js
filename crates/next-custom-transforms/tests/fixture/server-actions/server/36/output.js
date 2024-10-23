/* __next_internal_action_entry_do_not_use__ {"12a8d21b6362b4cc8f5b15560525095bc48dba80":"$$RSC_SERVER_CACHE_3","3128060c414d59f8552e4788b846c0d2b7f74743":"$$RSC_SERVER_CACHE_0","69348c79fce073bae2f70f139565a2fda1c74c74":"$$RSC_SERVER_CACHE_2","951c375b4a6a6e89d67b743ec5808127cfde405d":"$$RSC_SERVER_CACHE_1"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
export var $$RSC_SERVER_CACHE_0 = $$cache__("default", "3128060c414d59f8552e4788b846c0d2b7f74743", async function foo() {
    return 'data A';
});
Object.defineProperty($$RSC_SERVER_CACHE_0, "name", {
    "value": "foo",
    "writable": false
});
export var foo = registerServerReference($$RSC_SERVER_CACHE_0, "3128060c414d59f8552e4788b846c0d2b7f74743", null);
export var $$RSC_SERVER_CACHE_1 = $$cache__("default", "951c375b4a6a6e89d67b743ec5808127cfde405d", async function bar() {
    return 'data B';
});
Object.defineProperty($$RSC_SERVER_CACHE_1, "name", {
    "value": "bar",
    "writable": false
});
export var bar = registerServerReference($$RSC_SERVER_CACHE_1, "951c375b4a6a6e89d67b743ec5808127cfde405d", null);
export var $$RSC_SERVER_CACHE_2 = $$cache__("default", "69348c79fce073bae2f70f139565a2fda1c74c74", async function Cached({ children }) {
    return children;
});
Object.defineProperty($$RSC_SERVER_CACHE_2, "name", {
    "value": "Cached",
    "writable": false
});
export default registerServerReference($$RSC_SERVER_CACHE_2, "69348c79fce073bae2f70f139565a2fda1c74c74", null);
export var $$RSC_SERVER_CACHE_3 = $$cache__("default", "12a8d21b6362b4cc8f5b15560525095bc48dba80", async function baz() {
    return 'data C';
});
Object.defineProperty($$RSC_SERVER_CACHE_3, "name", {
    "value": "baz",
    "writable": false
});
export const baz = registerServerReference($$RSC_SERVER_CACHE_3, "12a8d21b6362b4cc8f5b15560525095bc48dba80", null);
