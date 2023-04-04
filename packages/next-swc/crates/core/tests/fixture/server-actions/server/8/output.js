/* __next_internal_action_entry_do_not_use__ $$ACTION_0 */ async function myAction(a, b, c) {
    // comment
    'use strict';
    console.log('a');
}
myAction.$$typeof = Symbol.for("react.server.reference");
myAction.$$id = "6d53ce510b2e36499b8f56038817b9bad86cabb4";
myAction.$$bound = [];
myAction.$$with_bound = false;
export const $$ACTION_0 = myAction;
export default function Page() {
    return <Button action={myAction}>Delete</Button>;
}
