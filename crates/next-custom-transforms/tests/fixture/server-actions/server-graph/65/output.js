/* __next_internal_action_entry_do_not_use__ {"006a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","ffc18c215a6b7cdc64bf709f3a714ffdef1bf9651d":"default"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
// @ts-ignore
import { wrapItLikeItsHot } from './wrap-it-like-its-hot';
// @ts-ignore
import { ClientComponent } from './client-component';
export const $$RSC_SERVER_ACTION_0 = async function action() {
    console.log('hot action');
};
registerServerReference($$RSC_SERVER_ACTION_0, "006a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
const $$RSC_SERVER_CACHE_1 = wrapItLikeItsHot(({ hot })=>{
    return <ClientComponent action={$$RSC_SERVER_ACTION_0}>
      {hot}
    </ClientComponent>;
});
let $$RSC_SERVER_CACHE_default = $$RSC_SERVER_CACHE_1;
if (typeof $$RSC_SERVER_CACHE_1 === "function") {
    $$RSC_SERVER_CACHE_default = $$reactCache__(function() {
        return $$cache__("default", "ffc18c215a6b7cdc64bf709f3a714ffdef1bf9651d", 0, $$RSC_SERVER_CACHE_1, Array.prototype.slice.call(arguments));
    });
    registerServerReference($$RSC_SERVER_CACHE_default, "ffc18c215a6b7cdc64bf709f3a714ffdef1bf9651d", null);
}
export default $$RSC_SERVER_CACHE_default;
