/* __next_internal_action_entry_do_not_use__ {"406a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","c0951c375b4a6a6e89d67b743ec5808127cfde405d":"$$RSC_SERVER_CACHE_1"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_0 = async function fn($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    console.log($$ACTION_ARG_0);
    return {
        foo: $$ACTION_ARG_1
    };
};
export var /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_CACHE_1 = $$cache__("default", "c0951c375b4a6a6e89d67b743ec5808127cfde405d", 0, async function Component({ foo }) {
    const a = 123;
    var fn = registerServerReference($$RSC_SERVER_ACTION_0, "406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null).bind(null, encryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", a, foo));
    const data = await fn();
    return <div>{data}</div>;
});
Object.defineProperty($$RSC_SERVER_CACHE_1, "name", {
    "value": "Component",
    "writable": false
});
export var Component = registerServerReference($$RSC_SERVER_CACHE_1, "c0951c375b4a6a6e89d67b743ec5808127cfde405d", null);
