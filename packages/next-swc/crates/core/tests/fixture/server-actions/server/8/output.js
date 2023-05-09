/* __next_internal_action_entry_do_not_use__ $$ACTION_0 */ import __create_action_proxy__ from "private-next-rsc-action-proxy";
async function myAction(...args) {
    return $$ACTION_0.apply(null, (myAction.$$bound || []).concat(args));
}
__create_action_proxy__("6d53ce510b2e36499b8f56038817b9bad86cabb4", null, myAction, $$ACTION_0);
export async function $$ACTION_0(a, b, c) {
    // comment
    'use strict';
    console.log('a');
}
export default function Page() {
    return <Button action={myAction}>Delete</Button>;
}
