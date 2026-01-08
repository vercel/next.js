import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
/* __next_internal_action_entry_do_not_use__ {"406a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","e0951c375b4a6a6e89d67b743ec5808127cfde405d":"$$RSC_SERVER_CACHE_1"} */ import { Button } from 'components';
const secret = 'my password is qwerty123';
export const $$RSC_SERVER_ACTION_0 = async function action($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    console.log(secret, $$ACTION_ARG_0);
};
registerServerReference($$RSC_SERVER_ACTION_0, "406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
const $$RSC_SERVER_CACHE_1_INNER = async function getCachedRandom(x, children) {
    return {
        x,
        y: Math.random(),
        z: <Button action={$$RSC_SERVER_ACTION_0.bind(null, encryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", x))}/>,
        r: children
    };
};
export var $$RSC_SERVER_CACHE_1 = $$reactCache__(function getCachedRandom() {
    return $$cache__("default", "e0951c375b4a6a6e89d67b743ec5808127cfde405d", 0, $$RSC_SERVER_CACHE_1_INNER, Array.prototype.slice.call(arguments, 0, 2));
});
registerServerReference($$RSC_SERVER_CACHE_1, "e0951c375b4a6a6e89d67b743ec5808127cfde405d", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_1, "name", {
    value: "getCachedRandom"
});
var getCachedRandom = $$RSC_SERVER_CACHE_1;
