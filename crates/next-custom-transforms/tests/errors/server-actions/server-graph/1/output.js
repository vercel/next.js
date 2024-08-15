/* __next_internal_action_entry_do_not_use__ {"ab21efdafbe611287bc25c0462b1e0510d13e48b":"foo"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export function foo() {}
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    foo
]);
registerServerReference("ab21efdafbe611287bc25c0462b1e0510d13e48b", foo);
