/* __next_internal_action_entry_do_not_use__ {"8012a8d21b6362b4cc8f5b15560525095bc48dba80":"$$RSC_SERVER_CACHE_3","803128060c414d59f8552e4788b846c0d2b7f74743":"$$RSC_SERVER_CACHE_0","8069348c79fce073bae2f70f139565a2fda1c74c74":"$$RSC_SERVER_CACHE_2","80951c375b4a6a6e89d67b743ec5808127cfde405d":"$$RSC_SERVER_CACHE_1"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
export var $$RSC_SERVER_CACHE_0 = $$cache__("default", "803128060c414d59f8552e4788b846c0d2b7f74743", 0, async function() {
    return 'foo';
});
registerServerReference($$RSC_SERVER_CACHE_0, "803128060c414d59f8552e4788b846c0d2b7f74743", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_0, "name", {
    value: "foo",
    writable: false
});
const foo = $$RSC_SERVER_CACHE_0;
export { bar };
export var $$RSC_SERVER_CACHE_1 = $$cache__("default", "80951c375b4a6a6e89d67b743ec5808127cfde405d", 0, async function bar() {
    return 'bar';
});
registerServerReference($$RSC_SERVER_CACHE_1, "80951c375b4a6a6e89d67b743ec5808127cfde405d", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_1, "name", {
    value: "bar",
    writable: false
});
var bar = $$RSC_SERVER_CACHE_1;
// Should not be wrapped in $$cache__.
const qux = async function qux() {
    return 'qux';
};
export var $$RSC_SERVER_CACHE_2 = $$cache__("default", "8069348c79fce073bae2f70f139565a2fda1c74c74", 0, async function baz() {
    return qux() + 'baz';
});
registerServerReference($$RSC_SERVER_CACHE_2, "8069348c79fce073bae2f70f139565a2fda1c74c74", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_2, "name", {
    value: "baz",
    writable: false
});
const baz = $$RSC_SERVER_CACHE_2;
export var $$RSC_SERVER_CACHE_3 = $$cache__("default", "8012a8d21b6362b4cc8f5b15560525095bc48dba80", 0, async function() {
    return 'quux';
});
registerServerReference($$RSC_SERVER_CACHE_3, "8012a8d21b6362b4cc8f5b15560525095bc48dba80", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_3, "name", {
    value: "quux",
    writable: false
});
const quux = $$RSC_SERVER_CACHE_3;
export { foo, baz };
export default quux;
