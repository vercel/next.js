/* __next_internal_action_entry_do_not_use__ foo,bar */ import __create_action_proxy__ from "private-next-rsc-action-proxy";
export const foo = async ()=>{};
const bar = async ()=>{};
export { bar };
import ensureServerEntryExports from "private-next-rsc-action-validate";
ensureServerEntryExports([
    foo,
    bar
]);
__create_action_proxy__("ab21efdafbe611287bc25c0462b1e0510d13e48b", null, foo);
__create_action_proxy__("ac840dcaf5e8197cb02b7f3a43c119b7a770b272", null, bar);
