/* __next_internal_action_entry_do_not_use__ {"0073f2cbccffb158eb2704761fc88fdbd0aaa102d0":"📙"} */ import { registerServerReference } from "private-next-rsc-server-reference";
async function foo() {}
export { foo as '📙' };
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    foo
]);
registerServerReference(foo, "0073f2cbccffb158eb2704761fc88fdbd0aaa102d0", null);
