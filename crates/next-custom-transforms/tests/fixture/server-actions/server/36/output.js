<<<<<<< HEAD
/* __next_internal_action_entry_do_not_use__ {"7f3128060c414d59f8552e4788b846c0d2b7f74743":"$$RSC_SERVER_CACHE_0","7f4acc55633206134002149ce873fe498be64a6fef":"$$RSC_SERVER_CACHE_4","7f69348c79fce073bae2f70f139565a2fda1c74c74":"$$RSC_SERVER_CACHE_2","7f951c375b4a6a6e89d67b743ec5808127cfde405d":"$$RSC_SERVER_CACHE_1"} */ import { registerServerReference } from "private-next-rsc-server-reference";
=======
/* __next_internal_action_entry_do_not_use__ {"12a8d21b6362b4cc8f5b15560525095bc48dba80":"$$RSC_SERVER_CACHE_3","3128060c414d59f8552e4788b846c0d2b7f74743":"$$RSC_SERVER_CACHE_0","69348c79fce073bae2f70f139565a2fda1c74c74":"$$RSC_SERVER_CACHE_2","951c375b4a6a6e89d67b743ec5808127cfde405d":"$$RSC_SERVER_CACHE_1"} */ import { registerServerReference } from "private-next-rsc-server-reference";
>>>>>>> canary
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
export var $$RSC_SERVER_CACHE_0 = $$cache__("default", "803128060c414d59f8552e4788b846c0d2b7f74743", async function foo() {
    return 'data A';
});
<<<<<<< HEAD
export var foo = registerServerReference($$RSC_SERVER_CACHE_0, "803128060c414d59f8552e4788b846c0d2b7f74743", null);
export var $$RSC_SERVER_CACHE_1 = $$cache__("default", "80951c375b4a6a6e89d67b743ec5808127cfde405d", async function bar() {
    return 'data B';
});
export var bar = registerServerReference($$RSC_SERVER_CACHE_1, "80951c375b4a6a6e89d67b743ec5808127cfde405d", null);
export var $$RSC_SERVER_CACHE_2 = $$cache__("default", "c069348c79fce073bae2f70f139565a2fda1c74c74", async function Cached({ children }) {
    return children;
});
export default registerServerReference($$RSC_SERVER_CACHE_2, "c069348c79fce073bae2f70f139565a2fda1c74c74", null);
export var $$RSC_SERVER_CACHE_4 = $$cache__("default", "804acc55633206134002149ce873fe498be64a6fef", async function $$RSC_SERVER_CACHE_3() {
    return 'data C';
});
export const baz = registerServerReference($$RSC_SERVER_CACHE_4, "804acc55633206134002149ce873fe498be64a6fef", null);
=======
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
>>>>>>> canary
