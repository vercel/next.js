/* __next_internal_action_entry_do_not_use__ foo,bar */ export const foo = async ()=>{};
const bar = async ()=>{};
export { bar };
import ensureServerEntryExports from "private-next-rsc-action-proxy";
ensureServerEntryExports([
    foo,
    bar
]);
foo.$$typeof = Symbol.for("react.server.reference");
foo.$$id = "ab21efdafbe611287bc25c0462b1e0510d13e48b";
foo.$$bound = [];
foo.$$with_bound = false;
bar.$$typeof = Symbol.for("react.server.reference");
bar.$$id = "ac840dcaf5e8197cb02b7f3a43c119b7a770b272";
bar.$$bound = [];
bar.$$with_bound = false;
