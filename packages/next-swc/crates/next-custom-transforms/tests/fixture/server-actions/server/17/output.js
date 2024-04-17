/* __next_internal_action_entry_do_not_use__ {"6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0","ab21efdafbe611287bc25c0462b1e0510d13e48b":"foo","ac840dcaf5e8197cb02b7f3a43c119b7a770b272":"bar"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export const foo = registerServerReference("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_0);
export async function $$ACTION_0() {}
const bar = async ()=>{};
export { bar };
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    foo,
    bar
]);
registerServerReference("ab21efdafbe611287bc25c0462b1e0510d13e48b", foo);
registerServerReference("ac840dcaf5e8197cb02b7f3a43c119b7a770b272", bar);
