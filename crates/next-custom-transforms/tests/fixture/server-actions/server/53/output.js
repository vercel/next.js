/* __next_internal_action_entry_do_not_use__ {"0090b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1","803128060c414d59f8552e4788b846c0d2b7f74743":"$$RSC_SERVER_CACHE_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
export var $$RSC_SERVER_CACHE_0 = $$cache__("default", "803128060c414d59f8552e4788b846c0d2b7f74743", 0, /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ async function foo() {});
Object.defineProperty($$RSC_SERVER_CACHE_0, "name", {
    "value": "foo",
    "writable": false
});
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_1 = async function bar() {};
export const obj = {
    foo: registerServerReference($$RSC_SERVER_CACHE_0, "803128060c414d59f8552e4788b846c0d2b7f74743", null),
    bar: registerServerReference($$RSC_SERVER_ACTION_1, "0090b5db271335765a4b0eab01f044b381b5ebd5cd", null)
};
