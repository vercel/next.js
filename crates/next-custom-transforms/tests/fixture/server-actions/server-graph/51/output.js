/* __next_internal_action_entry_do_not_use__ {"601c36b06e398c97abe5d5d7ae8c672bfddf4e1b91":"$$RSC_SERVER_ACTION_2","609ed0cc47abc4e1c64320cf42b74ae60b58c40f00":"$$RSC_SERVER_ACTION_3","7090b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export const $$RSC_SERVER_ACTION_1 = async function $$RSC_SERVER_ACTION_0(a, b, c) {
    return <div>
      {a}
      {b}
      {c}
    </div>;
};
registerServerReference($$RSC_SERVER_ACTION_1, "7090b5db271335765a4b0eab01f044b381b5ebd5cd", null);
export default $$RSC_SERVER_ACTION_1;
Object["defineProperty"]($$RSC_SERVER_ACTION_0, "name", {
    value: "default",
    writable: false
});
export const $$RSC_SERVER_ACTION_2 = async function foo(a, b) {
    return <div>
      {a}
      {b}
    </div>;
};
registerServerReference($$RSC_SERVER_ACTION_2, "601c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", null);
export var foo = $$RSC_SERVER_ACTION_2;
export const $$RSC_SERVER_ACTION_3 = async function bar(a, b) {
    return <div>
      {a}
      {b}
    </div>;
};
registerServerReference($$RSC_SERVER_ACTION_3, "609ed0cc47abc4e1c64320cf42b74ae60b58c40f00", null);
export const bar = $$RSC_SERVER_ACTION_3;
