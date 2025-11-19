import { registerServerReference } from "private-next-rsc-server-reference";
export default async function foo() {}
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    foo
]);
registerServerReference(foo, "00c18c215a6b7cdc64bf709f3a714ffdef1bf9651d", null);
