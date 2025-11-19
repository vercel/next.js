import { registerServerReference } from "private-next-rsc-server-reference";
export function foo() {}
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    foo
]);
registerServerReference(foo, "00ab21efdafbe611287bc25c0462b1e0510d13e48b", null);
