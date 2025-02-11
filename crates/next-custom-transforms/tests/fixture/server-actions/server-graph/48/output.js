/* __next_internal_action_entry_do_not_use__ {"60079087479e4c103d815f273878c7d1b8e902cc39":{"exported":"action3","original":"action3","span":{"start":393,"end":496}},"70f14702b5a021dd117f7ec7a3c838f397c2046d3b":{"exported":"action","original":"action","span":{"start":69,"end":169}},"7fc18c215a6b7cdc64bf709f3a714ffdef1bf9651d":{"exported":"default","original":"action2","span":{"start":233,"end":337}},"e03128060c414d59f8552e4788b846c0d2b7f74743":{"exported":"$$RSC_SERVER_CACHE_0","original":"cache","span":{"start":552,"end":652}}} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
// Should be 0 111000 0, which is "70" in hex.
export async function /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ action(a, b, c) {
    return <div>
      {a}
      {b}
      {c}
    </div>;
}
// Should be 0 111111 1, which is "7f" in hex.
export default async function /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ action2(a, b, ...c) {
    return <div>
      {a}
      {b}
      {c}
    </div>;
}
// Should be 0 111111 1, which is "60" in hex.
export async function /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ action3(a, b) {
    return <div>
      {a}
      {b}
    </div>;
}
export var /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_CACHE_0 = $$cache__("default", "e03128060c414d59f8552e4788b846c0d2b7f74743", 0, async function cache(a, b) {
    return <div>
      {a}
      {b}
    </div>;
});
Object.defineProperty($$RSC_SERVER_CACHE_0, "name", {
    "value": "cache",
    "writable": false
});
// Should be 1 110000 0, which is "e0" in hex.
export var cache = registerServerReference($$RSC_SERVER_CACHE_0, "e03128060c414d59f8552e4788b846c0d2b7f74743", null);
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    action,
    action2,
    action3
]);
registerServerReference(action, "70f14702b5a021dd117f7ec7a3c838f397c2046d3b", null);
registerServerReference(action2, "7fc18c215a6b7cdc64bf709f3a714ffdef1bf9651d", null);
registerServerReference(action3, "60079087479e4c103d815f273878c7d1b8e902cc39", null);
