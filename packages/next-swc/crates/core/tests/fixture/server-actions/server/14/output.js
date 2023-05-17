/* __next_internal_action_entry_do_not_use__ foo */ import __create_action_proxy__ from "private-next-rsc-action-proxy";
export async function foo() {
  async function bar() {}
}
import ensureServerEntryExports from "private-next-rsc-action-validate";
ensureServerEntryExports([
  foo
]);
__create_action_proxy__("ab21efdafbe611287bc25c0462b1e0510d13e48b", null, foo);
