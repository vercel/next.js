/* __next_internal_action_entry_do_not_use__ */ async function myAction(a, b, c) {
    console.log('a');
}
myAction.$$typeof = Symbol.for("react.action.reference");
myAction.$$filepath = "/app/item.js";
myAction.$$name = "$ACTION_myAction";
export const $ACTION_myAction = myAction;
export default function Page() {
    return <Button action={myAction}>Delete</Button>;
}
