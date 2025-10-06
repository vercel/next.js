/* __next_internal_action_entry_do_not_use__ {"406a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","c0951c375b4a6a6e89d67b743ec5808127cfde405d":"$$RSC_SERVER_CACHE_1"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
export const $$RSC_SERVER_ACTION_0 = async function fn($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    console.log($$ACTION_ARG_0);
    return {
        foo: $$ACTION_ARG_1
    };
};
registerServerReference($$RSC_SERVER_ACTION_0, "406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
export var $$RSC_SERVER_CACHE_1 = $$cache__("default", "c0951c375b4a6a6e89d67b743ec5808127cfde405d", 0, async function Component({ foo }) {
    const a = 123;
    var fn = $$RSC_SERVER_ACTION_0.bind(null, encryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", a, foo));
    const data = await fn();
    // @ts-expect-error: data is not a valid react child
    return <div>{data}</div>;
});
registerServerReference($$RSC_SERVER_CACHE_1, "c0951c375b4a6a6e89d67b743ec5808127cfde405d", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_1, "name", {
    value: "Component",
    writable: false
});
export var Component = $$RSC_SERVER_CACHE_1;
