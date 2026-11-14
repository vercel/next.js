/* __next_internal_action_entry_do_not_use__ [{"00c18c215a6b7cdc64bf709f3a714ffdef1bf9651d":{"name":"default","durable":true},"00f5c8c7c79daa6cc38a32ba760982c48dcb4ec09f":{"name":"arrow","durable":true},"4093c1844b3effd1d977be0ba593ad5b1785330b0b":{"name":"ordinary"},"40b7a826ae468e7884962e69864f9e1a63e74e6b6d":{"name":"namedAlias","durable":true}},"/app/item.js",""] */ import { registerServerReference } from "private-next-rsc-server-reference";
import 'next/cache';
export async function named(value) {
    void 0;
    return value;
}
export { named as namedAlias };
export const arrow = async ()=>void 0;
const $$RSC_SERVER_ACTION_0 = /*#__PURE__*/ Object["defineProperty"](async function() {
    void 0;
    return 'default';
}, "name", {
    value: "default"
});
export default $$RSC_SERVER_ACTION_0;
export async function ordinary(value) {
    return value;
}
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    named,
    arrow,
    $$RSC_SERVER_ACTION_0,
    ordinary
]);
registerServerReference(named, "40b7a826ae468e7884962e69864f9e1a63e74e6b6d", null);
registerServerReference(arrow, "00f5c8c7c79daa6cc38a32ba760982c48dcb4ec09f", null);
registerServerReference($$RSC_SERVER_ACTION_0, "00c18c215a6b7cdc64bf709f3a714ffdef1bf9651d", null);
registerServerReference(ordinary, "4093c1844b3effd1d977be0ba593ad5b1785330b0b", null);
