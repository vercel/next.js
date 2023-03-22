/* __next_internal_action_entry_do_not_use__ a,b,c */ export async function a() {}
export async function b() {}
export async function c() {}
function d() {}
function Foo() {
    async function e() {}
}
import ensureServerEntryExports from "private-next-rsc-action-proxy";
ensureServerEntryExports([
    a,
    b,
    c
]);
a.$$typeof = Symbol.for("react.server.reference");
a.$$id = "6e7bc104e4d6e7fda190c4a51be969cfd0be6d6d";
a.$$bound = [];
a.$$with_bound = false;
b.$$typeof = Symbol.for("react.server.reference");
b.$$id = "d1f7eb64271d7c601dfef7d4d7053de1c2ca4338";
b.$$bound = [];
b.$$with_bound = false;
c.$$typeof = Symbol.for("react.server.reference");
c.$$id = "1ab723c80dcca470e0410b4b2a2fc2bf21f41476";
c.$$bound = [];
c.$$with_bound = false;
