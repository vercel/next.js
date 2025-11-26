/* __next_internal_action_entry_do_not_use__ {"ffc18c215a6b7cdc64bf709f3a714ffdef1bf9651d":"default"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
// @ts-ignore
import { withSlug } from './with-slug';
const Page = withSlug(function Page({ slug }) {
    return <p>Slug: {slug}</p>;
});
let $$RSC_SERVER_CACHE_default = Page;
if (typeof Page === "function") {
    $$RSC_SERVER_CACHE_default = $$reactCache__(function() {
        return $$cache__("default", "ffc18c215a6b7cdc64bf709f3a714ffdef1bf9651d", 0, Page, arguments);
    });
    registerServerReference($$RSC_SERVER_CACHE_default, "ffc18c215a6b7cdc64bf709f3a714ffdef1bf9651d", null);
    Object["defineProperty"]($$RSC_SERVER_CACHE_default, "name", {
        value: "Page"
    });
}
export default $$RSC_SERVER_CACHE_default;
