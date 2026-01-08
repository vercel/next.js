/* __next_internal_action_entry_do_not_use__ {"ffaa88e24cee8047d167e47f4f374dbddc187e2899":"fooCached"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
const { foo: fooCached } = {
    foo: async ()=>{}
};
let $$RSC_SERVER_CACHE_fooCached = fooCached;
if (typeof fooCached === "function") {
    $$RSC_SERVER_CACHE_fooCached = $$reactCache__(function() {
        return $$cache__("default", "ffaa88e24cee8047d167e47f4f374dbddc187e2899", 0, fooCached, Array.prototype.slice.call(arguments));
    });
    registerServerReference($$RSC_SERVER_CACHE_fooCached, "ffaa88e24cee8047d167e47f4f374dbddc187e2899", null);
    Object["defineProperty"]($$RSC_SERVER_CACHE_fooCached, "name", {
        value: "fooCached"
    });
}
export { $$RSC_SERVER_CACHE_fooCached as fooCached };
