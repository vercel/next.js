/* __next_internal_action_entry_do_not_use__ default,bar */ const foo = async function() {};
export default foo;
const bar = async function() {};
export { bar };
import ensureServerEntryExports from "private-next-rsc-action-proxy";
ensureServerEntryExports([
    foo,
    bar
]);
foo.$$typeof = Symbol.for("react.server.reference");
foo.$$id = "c18c215a6b7cdc64bf709f3a714ffdef1bf9651d";
foo.$$bound = [];
foo.$$with_bound = false;
bar.$$typeof = Symbol.for("react.server.reference");
bar.$$id = "ac840dcaf5e8197cb02b7f3a43c119b7a770b272";
bar.$$bound = [];
bar.$$with_bound = false;
