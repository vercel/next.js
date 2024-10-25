<<<<<<< HEAD
/* __next_internal_action_entry_do_not_use__ {"7f6a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","7fab21efdafbe611287bc25c0462b1e0510d13e48b":"foo","7fac840dcaf5e8197cb02b7f3a43c119b7a770b272":"bar"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export const foo = registerServerReference($$RSC_SERVER_ACTION_0, "006a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
export async function $$RSC_SERVER_ACTION_0() {}
=======
/* __next_internal_action_entry_do_not_use__ {"ab21efdafbe611287bc25c0462b1e0510d13e48b":"foo","ac840dcaf5e8197cb02b7f3a43c119b7a770b272":"bar"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export const foo = async ()=>{};
>>>>>>> canary
const bar = async ()=>{};
export { bar };
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    foo,
    bar
]);
registerServerReference(foo, "ffab21efdafbe611287bc25c0462b1e0510d13e48b", null);
registerServerReference(bar, "ffac840dcaf5e8197cb02b7f3a43c119b7a770b272", null);
