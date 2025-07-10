// Rules here:
// 1. Each exported function should still be exported, but as a reference `registerServerReference(...)`.
// 2. Actual action functions should be renamed to `$$ACTION_...` and got exported.
/* __next_internal_action_entry_do_not_use__ {"001c36b06e398c97abe5d5d7ae8c672bfddf4e1b91":"$$RSC_SERVER_ACTION_2","006a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","0090b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1","009ed0cc47abc4e1c64320cf42b74ae60b58c40f00":"$$RSC_SERVER_ACTION_3","00a9b2939c1f39073a6bed227fd20233064c8b7869":"$$RSC_SERVER_ACTION_4"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export const $$RSC_SERVER_ACTION_0 = async function foo() {
    console.log(1);
};
registerServerReference($$RSC_SERVER_ACTION_0, "006a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
var foo = $$RSC_SERVER_ACTION_0;
export { foo };
export const $$RSC_SERVER_ACTION_1 = async function bar() {
    console.log(2);
};
registerServerReference($$RSC_SERVER_ACTION_1, "0090b5db271335765a4b0eab01f044b381b5ebd5cd", null);
export var bar = $$RSC_SERVER_ACTION_1;
export const $$RSC_SERVER_ACTION_2 = async function baz() {
    console.log(3);
};
registerServerReference($$RSC_SERVER_ACTION_2, "001c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", null);
export default $$RSC_SERVER_ACTION_2;
export const $$RSC_SERVER_ACTION_3 = async function qux() {
    console.log(4);
};
registerServerReference($$RSC_SERVER_ACTION_3, "009ed0cc47abc4e1c64320cf42b74ae60b58c40f00", null);
export const qux = $$RSC_SERVER_ACTION_3;
export const $$RSC_SERVER_ACTION_4 = async function quuux() {
    console.log(5);
};
registerServerReference($$RSC_SERVER_ACTION_4, "00a9b2939c1f39073a6bed227fd20233064c8b7869", null);
export const quux = $$RSC_SERVER_ACTION_4;
