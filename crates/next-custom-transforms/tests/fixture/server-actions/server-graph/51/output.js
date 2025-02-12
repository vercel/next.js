/* __next_internal_action_entry_do_not_use__ {"601c36b06e398c97abe5d5d7ae8c672bfddf4e1b91":{"exported":"$$RSC_SERVER_ACTION_2","original":"foo","span":{"start":148,"end":248}},"609ed0cc47abc4e1c64320cf42b74ae60b58c40f00":{"exported":"$$RSC_SERVER_ACTION_3","original":null,"span":{"start":269,"end":360}},"7090b5db271335765a4b0eab01f044b381b5ebd5cd":{"exported":"$$RSC_SERVER_ACTION_1","original":null,"span":{"start":29,"end":139}}} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_1 = async function(a, b, c) {
    return <div>
      {a}
      {b}
      {c}
    </div>;
};
export default registerServerReference($$RSC_SERVER_ACTION_1, "7090b5db271335765a4b0eab01f044b381b5ebd5cd", null);
Object.defineProperty($$RSC_SERVER_ACTION_0, "name", {
    "value": "default",
    "writable": false
});
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_2 = async function foo(a, b) {
    return <div>
      {a}
      {b}
    </div>;
};
export var foo = registerServerReference($$RSC_SERVER_ACTION_2, "601c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", null);
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_3 = async function bar(a, b) {
    return <div>
      {a}
      {b}
    </div>;
};
export const bar = registerServerReference($$RSC_SERVER_ACTION_3, "609ed0cc47abc4e1c64320cf42b74ae60b58c40f00", null);
