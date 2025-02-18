/* __next_internal_action_entry_do_not_use__ {"406a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","e0951c375b4a6a6e89d67b743ec5808127cfde405d":"$$RSC_SERVER_CACHE_1"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { Foo } from './client';
const secret = 'my password is qwerty123';
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_0 = async function action($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    console.log(secret, $$ACTION_ARG_0);
};
export var /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_CACHE_1 = $$cache__("default", "e0951c375b4a6a6e89d67b743ec5808127cfde405d", 0, async function getCachedRandom(x, children) {
    return {
        x,
        y: Math.random(),
        z: <Foo action={registerServerReference($$RSC_SERVER_ACTION_0, "406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null).bind(null, encryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", x))}/>,
        r: children
    };
});
Object.defineProperty($$RSC_SERVER_CACHE_1, "name", {
    "value": "getCachedRandom",
    "writable": false
});
var getCachedRandom = registerServerReference($$RSC_SERVER_CACHE_1, "e0951c375b4a6a6e89d67b743ec5808127cfde405d", null);
