/* __next_internal_action_entry_do_not_use__ {"803128060c414d59f8552e4788b846c0d2b7f74743":{"name":"$$RSC_SERVER_CACHE_0"}} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
// Route segment configs, metadata, and viewport are statically known
// non-function values. They should be exported as-is, without cache runtime
// wrappers.
export const instant = false;
export const dynamicParams = true;
export const prefetch = 'partial';
export const maxDuration = 5;
export const metadata = {
    title: 'Hello'
};
const $$RSC_SERVER_CACHE_0_INNER = async function Page() {
    return null;
};
export var $$RSC_SERVER_CACHE_0 = $$reactCache__(function Page() {
    return $$cache__("default", "803128060c414d59f8552e4788b846c0d2b7f74743", 0, $$RSC_SERVER_CACHE_0_INNER, []);
});
registerServerReference($$RSC_SERVER_CACHE_0, "803128060c414d59f8552e4788b846c0d2b7f74743", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_0, "name", {
    value: "Page"
});
export default $$RSC_SERVER_CACHE_0;
