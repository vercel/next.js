/* __next_internal_action_entry_do_not_use__ {"ab21efdafbe611287bc25c0462b1e0510d13e48b":"foo","ac840dcaf5e8197cb02b7f3a43c119b7a770b272":"bar"} */ import { createActionProxy } from "private-next-rsc-action-proxy";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export const foo = createActionProxy("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_0);
export async function $$ACTION_0() {}
const bar = async ()=>{};
export { bar };
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    foo,
    bar
]);
createActionProxy("ab21efdafbe611287bc25c0462b1e0510d13e48b", foo);
createActionProxy("ac840dcaf5e8197cb02b7f3a43c119b7a770b272", bar);
