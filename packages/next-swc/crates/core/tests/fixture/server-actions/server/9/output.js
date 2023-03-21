// app/send.ts
/* __next_internal_action_entry_do_not_use__ foo,baz,default */ async function foo() {}
export { foo };
async function bar() {}
export { bar as baz };
async function qux() {}
export { qux as default };
import ensureServerEntryExports from "private-next-rsc-action-proxy";
ensureServerEntryExports([
    foo,
    bar,
    qux
]);
foo.$$typeof = Symbol.for("react.server.reference");
foo.$$id = "ab21efdafbe611287bc25c0462b1e0510d13e48b";
foo.$$bound = [];
foo.$$with_bound = false;
bar.$$typeof = Symbol.for("react.server.reference");
bar.$$id = "050e3854b72b19e3c7e3966a67535543a90bf7e0";
bar.$$bound = [];
bar.$$with_bound = false;
qux.$$typeof = Symbol.for("react.server.reference");
qux.$$id = "c18c215a6b7cdc64bf709f3a714ffdef1bf9651d";
qux.$$bound = [];
qux.$$with_bound = false;
