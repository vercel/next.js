import { registerServerReference } from "private-next-rsc-server-reference";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
/* __next_internal_action_entry_do_not_use__ {"803128060c414d59f8552e4788b846c0d2b7f74743":{"name":"$$RSC_SERVER_CACHE_0"}} */ const v = 'world';
const $$RSC_SERVER_CACHE_0_INNER = async function fn() {
    return 'hello, ' + v;
};
export var $$RSC_SERVER_CACHE_0 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function fn() {
    return $$cache__("default", "803128060c414d59f8552e4788b846c0d2b7f74743", 0, $$RSC_SERVER_CACHE_0_INNER, []);
}), "803128060c414d59f8552e4788b846c0d2b7f74743", null), "name", {
    value: "fn"
});
var fn = $$RSC_SERVER_CACHE_0;
export async function Component() {
    const data = await fn();
    return <div>{data}</div>;
}
