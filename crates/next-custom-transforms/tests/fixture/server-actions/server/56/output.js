/* __next_internal_action_entry_do_not_use__ {} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
// No method nor function property should be considered a cache function.
export const obj = {
    foo () {
        return 1;
    },
    async bar () {
        return 2;
    },
    baz: ()=>2,
    qux: async ()=>3
};
