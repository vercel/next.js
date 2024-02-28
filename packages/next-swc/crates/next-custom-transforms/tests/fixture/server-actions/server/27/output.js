// Rules here:
// 1. Each exported function should still be exported, but as a reference `registerServerReference(...)`.
// 2. Actual action functions should be renamed to `$$ACTION_...` and got exported.
/* __next_internal_action_entry_do_not_use__ {"188d5d945750dc32e2c842b93c75a65763d4a922":"$$ACTION_1","56a859f462d35a297c46a1bbd1e6a9058c104ab8":"$$ACTION_3","6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0","9878bfa39811ca7650992850a8751f9591b6a557":"$$ACTION_2","9c0dd1f7c2b3f41d32e10f5c437de3d67ad32c6c":"$$ACTION_4"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
var foo = registerServerReference("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_0);
export async function $$ACTION_0() {
    console.log(1);
}
export { foo };
export var bar = registerServerReference("188d5d945750dc32e2c842b93c75a65763d4a922", $$ACTION_1);
export async function $$ACTION_1() {
    console.log(2);
}
export default registerServerReference("9878bfa39811ca7650992850a8751f9591b6a557", $$ACTION_2);
export async function $$ACTION_2() {
    console.log(3);
}
export const qux = registerServerReference("56a859f462d35a297c46a1bbd1e6a9058c104ab8", $$ACTION_3);
export async function $$ACTION_3() {
    console.log(4);
}
export const quux = registerServerReference("9c0dd1f7c2b3f41d32e10f5c437de3d67ad32c6c", $$ACTION_4);
export async function $$ACTION_4() {
    console.log(5);
}
