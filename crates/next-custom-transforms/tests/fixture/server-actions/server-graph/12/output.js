import { registerServerReference } from "private-next-rsc-server-reference";
async function foo() {}
export default foo;
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    foo
]);
registerServerReference(foo, "7fc18c215a6b7cdc64bf709f3a714ffdef1bf9651d", null);
