/* __next_internal_action_entry_do_not_use__ {"12a8d21b6362b4cc8f5b15560525095bc48dba80":"$$RSC_SERVER_CACHE_3","3128060c414d59f8552e4788b846c0d2b7f74743":"$$RSC_SERVER_CACHE_0","4acc55633206134002149ce873fe498be64a6fef":"$$RSC_SERVER_CACHE_4","951c375b4a6a6e89d67b743ec5808127cfde405d":"$$RSC_SERVER_CACHE_1"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
export var $$RSC_SERVER_CACHE_0 = $$cache__("default", "3128060c414d59f8552e4788b846c0d2b7f74743", async function() {
    return 'foo';
});
const foo = registerServerReference($$RSC_SERVER_CACHE_0, "3128060c414d59f8552e4788b846c0d2b7f74743", null);
export { bar };
export var $$RSC_SERVER_CACHE_1 = $$cache__("default", "951c375b4a6a6e89d67b743ec5808127cfde405d", async function bar() {
    return 'bar';
});
var bar = registerServerReference($$RSC_SERVER_CACHE_1, "951c375b4a6a6e89d67b743ec5808127cfde405d", null);
// Should not be wrapped in $$cache__.
const qux = async function qux() {
    return 'qux';
};
export var $$RSC_SERVER_CACHE_3 = $$cache__("default", "12a8d21b6362b4cc8f5b15560525095bc48dba80", async function $$RSC_SERVER_CACHE_2() {
    return qux() + 'baz';
});
const baz = registerServerReference($$RSC_SERVER_CACHE_3, "12a8d21b6362b4cc8f5b15560525095bc48dba80", null);
export var $$RSC_SERVER_CACHE_4 = $$cache__("default", "4acc55633206134002149ce873fe498be64a6fef", async function() {
    return 'quux';
});
const quux = registerServerReference($$RSC_SERVER_CACHE_4, "4acc55633206134002149ce873fe498be64a6fef", null);
export { foo, baz };
export default quux;
