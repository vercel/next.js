/* __next_internal_action_entry_do_not_use__ $$ACTION_0 */ import __create_action_proxy__ from "private-next-rsc-action-proxy";
async function myAction(...args) {
    return $$ACTION_0((myAction.$$bound || []).concat(args));
}
myAction.$$typeof = Symbol.for("react.server.reference");
myAction.$$id = "6d53ce510b2e36499b8f56038817b9bad86cabb4";
myAction.$$bound = null;
__create_action_proxy__(myAction, $$ACTION_0);
export async function $$ACTION_0(closure, a = closure[0], b = closure[1], c = closure[2]) {
    // comment
    'use strict';
    console.log('a');
}
export default function Page() {
    return <Button action={myAction}>Delete</Button>;
}
