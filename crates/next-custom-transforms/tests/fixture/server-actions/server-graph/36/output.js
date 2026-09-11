/* __next_internal_action_entry_do_not_use__ {"8012a8d21b6362b4cc8f5b15560525095bc48dba80":{"name":"$$RSC_SERVER_CACHE_3"},"803128060c414d59f8552e4788b846c0d2b7f74743":{"name":"$$RSC_SERVER_CACHE_0"},"80951c375b4a6a6e89d67b743ec5808127cfde405d":{"name":"$$RSC_SERVER_CACHE_1"},"c069348c79fce073bae2f70f139565a2fda1c74c74":{"name":"$$RSC_SERVER_CACHE_2"}} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
const $$RSC_SERVER_CACHE_0_INNER = async function foo() {
    return 'data A';
};
export var $$RSC_SERVER_CACHE_0 = $$cache__("default", "803128060c414d59f8552e4788b846c0d2b7f74743", 0, $$RSC_SERVER_CACHE_0_INNER, 0);
registerServerReference($$RSC_SERVER_CACHE_0, "803128060c414d59f8552e4788b846c0d2b7f74743", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_0, "name", {
    value: "foo"
});
export var foo = $$RSC_SERVER_CACHE_0;
const $$RSC_SERVER_CACHE_1_INNER = async function bar() {
    return 'data B';
};
export var $$RSC_SERVER_CACHE_1 = $$cache__("default", "80951c375b4a6a6e89d67b743ec5808127cfde405d", 0, $$RSC_SERVER_CACHE_1_INNER, 0);
registerServerReference($$RSC_SERVER_CACHE_1, "80951c375b4a6a6e89d67b743ec5808127cfde405d", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_1, "name", {
    value: "bar"
});
export var bar = $$RSC_SERVER_CACHE_1;
const $$RSC_SERVER_CACHE_2_INNER = async function Cached({ children }) {
    return children;
};
export var $$RSC_SERVER_CACHE_2 = $$cache__("default", "c069348c79fce073bae2f70f139565a2fda1c74c74", 0, $$RSC_SERVER_CACHE_2_INNER, 1);
registerServerReference($$RSC_SERVER_CACHE_2, "c069348c79fce073bae2f70f139565a2fda1c74c74", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_2, "name", {
    value: "Cached"
});
export default $$RSC_SERVER_CACHE_2;
const $$RSC_SERVER_CACHE_3_INNER = async function baz() {
    return 'data C';
};
export var $$RSC_SERVER_CACHE_3 = $$cache__("default", "8012a8d21b6362b4cc8f5b15560525095bc48dba80", 0, $$RSC_SERVER_CACHE_3_INNER, 0);
registerServerReference($$RSC_SERVER_CACHE_3, "8012a8d21b6362b4cc8f5b15560525095bc48dba80", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_3, "name", {
    value: "baz"
});
export const baz = $$RSC_SERVER_CACHE_3;
