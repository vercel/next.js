/* __next_internal_action_entry_do_not_use__ {"60079087479e4c103d815f273878c7d1b8e902cc39":"action3","70f14702b5a021dd117f7ec7a3c838f397c2046d3b":"action","7fc18c215a6b7cdc64bf709f3a714ffdef1bf9651d":"default","e03128060c414d59f8552e4788b846c0d2b7f74743":"$$RSC_SERVER_CACHE_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
// Should be 0 111000 0, which is "70" in hex.
export async function action(a, b, c) {
    return <div>
      {a}
      {b}
      {c}
    </div>;
}
// Should be 0 111111 1, which is "7f" in hex.
export default async function action2(a, b, ...c) {
    return <div>
      {a}
      {b}
      {c}
    </div>;
}
// Should be 0 111111 1, which is "60" in hex.
export async function action3(a, b) {
    return <div>
      {a}
      {b}
    </div>;
}
export var $$RSC_SERVER_CACHE_0 = $$cache__("default", "e03128060c414d59f8552e4788b846c0d2b7f74743", 0, async function cache(a, b) {
    return <div>
      {a}
      {b}
    </div>;
});
registerServerReference($$RSC_SERVER_CACHE_0, "e03128060c414d59f8552e4788b846c0d2b7f74743", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_0, "name", {
    value: "cache",
    writable: false
});
// Should be 1 110000 0, which is "e0" in hex.
export var cache = $$RSC_SERVER_CACHE_0;
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    action,
    action2,
    action3
]);
registerServerReference(action, "70f14702b5a021dd117f7ec7a3c838f397c2046d3b", null);
registerServerReference(action2, "7fc18c215a6b7cdc64bf709f3a714ffdef1bf9651d", null);
registerServerReference(action3, "60079087479e4c103d815f273878c7d1b8e902cc39", null);
