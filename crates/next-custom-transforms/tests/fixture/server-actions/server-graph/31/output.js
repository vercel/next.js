/* __next_internal_action_entry_do_not_use__ {"7fabf760c735ba66c4c26a2913864dd7e28fb88a91":"action2","7ff14702b5a021dd117f7ec7a3c838f397c2046d3b":"action"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export const action = {
    async f (x) {
        ;
        (()=>{
            console.log(x);
        })();
    }
}.f;
export const action2 = new class X {
    async f(x) {
        ;
        (()=>{
            console.log(x);
        })();
    }
}().f;
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    action,
    action2
]);
registerServerReference(action, "7ff14702b5a021dd117f7ec7a3c838f397c2046d3b", null);
registerServerReference(action2, "7fabf760c735ba66c4c26a2913864dd7e28fb88a91", null);
