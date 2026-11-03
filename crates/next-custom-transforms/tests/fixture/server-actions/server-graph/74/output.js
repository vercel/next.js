/* __next_internal_action_entry_do_not_use__ {"0027fadf3eeb97c777cea9f14a407b5c0b42ac65bb":{"name":"aliased"},"003c8ed39a99caf636869d076cc7cae786a4053164":{"name":"qux"},"00c18c215a6b7cdc64bf709f3a714ffdef1bf9651d":{"name":"default"}} */ import { registerServerReference } from "private-next-rsc-server-reference";
export const qux = async function wrongId1() {
    return 'exported named function expression';
};
const local = async function wrongId2() {
    return 'aliased named function expression';
};
export { local as aliased };
const defaultAction = async function wrongId3() {
    return 'default exported named function expression';
};
export default defaultAction;
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    qux,
    local,
    defaultAction
]);
registerServerReference(qux, "003c8ed39a99caf636869d076cc7cae786a4053164", null);
registerServerReference(local, "0027fadf3eeb97c777cea9f14a407b5c0b42ac65bb", null);
registerServerReference(defaultAction, "00c18c215a6b7cdc64bf709f3a714ffdef1bf9651d", null);
