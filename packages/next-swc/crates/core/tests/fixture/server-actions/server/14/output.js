/* __next_internal_action_entry_do_not_use__ foo */ import __create_action_proxy__ from "private-next-rsc-action-proxy";
export async function foo() {
  async function bar() {}
}
import ensureServerEntryExports from "private-next-rsc-action-validate";
ensureServerEntryExports([
  foo
]);
foo.$$typeof = Symbol.for("react.server.reference");
foo.$$id = "ab21efdafbe611287bc25c0462b1e0510d13e48b";
foo.$$bound = null;
foo.$$with_bound = false;
__create_action_proxy__(foo);
