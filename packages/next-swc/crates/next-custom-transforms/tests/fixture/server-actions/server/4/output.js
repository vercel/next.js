/* __next_internal_action_entry_do_not_use__ {"1ab723c80dcca470e0410b4b2a2fc2bf21f41476":"c","6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0","6e7bc104e4d6e7fda190c4a51be969cfd0be6d6d":"a","d1f7eb64271d7c601dfef7d4d7053de1c2ca4338":"b"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export async function a() {}
export async function b() {}
export async function c() {}
function d() {}
function Foo() {
    var e = registerServerReference("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_0);
}
export async function $$ACTION_0() {}
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    a,
    b,
    c
]);
registerServerReference("6e7bc104e4d6e7fda190c4a51be969cfd0be6d6d", a);
registerServerReference("d1f7eb64271d7c601dfef7d4d7053de1c2ca4338", b);
registerServerReference("1ab723c80dcca470e0410b4b2a2fc2bf21f41476", c);
