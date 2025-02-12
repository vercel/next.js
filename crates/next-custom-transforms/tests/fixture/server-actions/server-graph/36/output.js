/* __next_internal_action_entry_do_not_use__ {"8012a8d21b6362b4cc8f5b15560525095bc48dba80":{"exported":"$$RSC_SERVER_CACHE_3","original":"baz","span":{"start":209,"end":248}},"803128060c414d59f8552e4788b846c0d2b7f74743":{"exported":"$$RSC_SERVER_CACHE_0","original":"foo","span":{"start":21,"end":63}},"80951c375b4a6a6e89d67b743ec5808127cfde405d":{"exported":"$$RSC_SERVER_CACHE_1","original":"bar","span":{"start":72,"end":114}},"c069348c79fce073bae2f70f139565a2fda1c74c74":{"exported":"$$RSC_SERVER_CACHE_2","original":"Cached","span":{"start":131,"end":188}}} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
export var /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_CACHE_0 = $$cache__("default", "803128060c414d59f8552e4788b846c0d2b7f74743", 0, async function foo() {
    return 'data A';
});
Object.defineProperty($$RSC_SERVER_CACHE_0, "name", {
    "value": "foo",
    "writable": false
});
export var foo = registerServerReference($$RSC_SERVER_CACHE_0, "803128060c414d59f8552e4788b846c0d2b7f74743", null);
export var /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_CACHE_1 = $$cache__("default", "80951c375b4a6a6e89d67b743ec5808127cfde405d", 0, async function bar() {
    return 'data B';
});
Object.defineProperty($$RSC_SERVER_CACHE_1, "name", {
    "value": "bar",
    "writable": false
});
export var bar = registerServerReference($$RSC_SERVER_CACHE_1, "80951c375b4a6a6e89d67b743ec5808127cfde405d", null);
export var /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_CACHE_2 = $$cache__("default", "c069348c79fce073bae2f70f139565a2fda1c74c74", 0, async function Cached({ children }) {
    return children;
});
Object.defineProperty($$RSC_SERVER_CACHE_2, "name", {
    "value": "Cached",
    "writable": false
});
export default registerServerReference($$RSC_SERVER_CACHE_2, "c069348c79fce073bae2f70f139565a2fda1c74c74", null);
export var /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_CACHE_3 = $$cache__("default", "8012a8d21b6362b4cc8f5b15560525095bc48dba80", 0, async function baz() {
    return 'data C';
});
Object.defineProperty($$RSC_SERVER_CACHE_3, "name", {
    "value": "baz",
    "writable": false
});
export const baz = registerServerReference($$RSC_SERVER_CACHE_3, "8012a8d21b6362b4cc8f5b15560525095bc48dba80", null);
