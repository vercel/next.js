/* __next_internal_action_entry_do_not_use__ default */ async function foo() {}
export default foo;
import ensureServerEntryExports from "private-next-rsc-action-proxy";
ensureServerEntryExports([
    foo
]);
foo.$$typeof = Symbol.for("react.server.reference");
foo.$$id = "c18c215a6b7cdc64bf709f3a714ffdef1bf9651d";
foo.$$bound = [];
foo.$$with_bound = false;
