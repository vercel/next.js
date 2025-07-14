/* __next_internal_action_entry_do_not_use__ {"409ed0cc47abc4e1c64320cf42b74ae60b58c40f00":"$$RSC_SERVER_ACTION_3","601c36b06e398c97abe5d5d7ae8c672bfddf4e1b91":"$$RSC_SERVER_ACTION_2","c0951c375b4a6a6e89d67b743ec5808127cfde405d":"$$RSC_SERVER_CACHE_1","e03128060c414d59f8552e4788b846c0d2b7f74743":"$$RSC_SERVER_CACHE_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { Client } from 'components';
export var $$RSC_SERVER_CACHE_0 = $$cache__("default", "e03128060c414d59f8552e4788b846c0d2b7f74743", 2, async function([$$ACTION_ARG_0, $$ACTION_ARG_1], c) {
    return $$ACTION_ARG_0 + $$ACTION_ARG_1 + c;
});
registerServerReference($$RSC_SERVER_CACHE_0, "e03128060c414d59f8552e4788b846c0d2b7f74743", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_0, "name", {
    value: "fn1",
    writable: false
});
export var $$RSC_SERVER_CACHE_1 = $$cache__("default", "c0951c375b4a6a6e89d67b743ec5808127cfde405d", 2, async function // Should be 1 100000 0, which is "c0" in hex (counts as one param,
// because of the encrypted bound args param)
fn2([$$ACTION_ARG_0, $$ACTION_ARG_1]) {
    return $$ACTION_ARG_0 + $$ACTION_ARG_1;
});
registerServerReference($$RSC_SERVER_CACHE_1, "c0951c375b4a6a6e89d67b743ec5808127cfde405d", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_1, "name", {
    value: "fn2",
    writable: false
});
export const $$RSC_SERVER_ACTION_2 = async function // Should be 0 110000 0, which is "60" in hex (counts as two params,
// because of the encrypted bound args param)
fn3($$ACTION_CLOSURE_BOUND, c) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("601c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", $$ACTION_CLOSURE_BOUND);
    return $$ACTION_ARG_0 + $$ACTION_ARG_1 + c;
};
registerServerReference($$RSC_SERVER_ACTION_2, "601c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", null);
export const $$RSC_SERVER_ACTION_3 = async function // Should be 0 100000 0, which is "40" in hex (counts as one param,
// because of the encrypted bound args param)
fn4($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("409ed0cc47abc4e1c64320cf42b74ae60b58c40f00", $$ACTION_CLOSURE_BOUND);
    return $$ACTION_ARG_0 + $$ACTION_ARG_1;
};
registerServerReference($$RSC_SERVER_ACTION_3, "409ed0cc47abc4e1c64320cf42b74ae60b58c40f00", null);
export async function Component(a) {
    const b = 1;
    return <Client // Should be 1 110000 0, which is "e0" in hex (counts as two params,
    // because of the encrypted bound args param)
    fn1={$$RSC_SERVER_CACHE_0.bind(null, encryptActionBoundArgs("e03128060c414d59f8552e4788b846c0d2b7f74743", a, b))} fn2={$$RSC_SERVER_CACHE_1.bind(null, encryptActionBoundArgs("c0951c375b4a6a6e89d67b743ec5808127cfde405d", a, b))} fn3={$$RSC_SERVER_ACTION_2.bind(null, encryptActionBoundArgs("601c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", a, b))} fn4={$$RSC_SERVER_ACTION_3.bind(null, encryptActionBoundArgs("409ed0cc47abc4e1c64320cf42b74ae60b58c40f00", a, b))}/>;
}
