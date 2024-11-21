/* __next_internal_action_entry_do_not_use__ {"001ab723c80dcca470e0410b4b2a2fc2bf21f41476":"c","006a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","006e7bc104e4d6e7fda190c4a51be969cfd0be6d6d":"a","00d1f7eb64271d7c601dfef7d4d7053de1c2ca4338":"b"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export async function /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ a() {}
export async function /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ b() {}
export async function /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ c() {}
function d() {}
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_0 = async function e() {};
function Foo() {
    var e = registerServerReference($$RSC_SERVER_ACTION_0, "006a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
}
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    a,
    b,
    c
]);
registerServerReference(a, "006e7bc104e4d6e7fda190c4a51be969cfd0be6d6d", null);
registerServerReference(b, "00d1f7eb64271d7c601dfef7d4d7053de1c2ca4338", null);
registerServerReference(c, "001ab723c80dcca470e0410b4b2a2fc2bf21f41476", null);
