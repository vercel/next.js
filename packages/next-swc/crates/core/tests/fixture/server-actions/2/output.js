/* __next_internal_action_entry_do_not_use__ $ACTION_myAction */ async function myAction(a, b, c) {
    console.log('a');
}
myAction.$$typeof = Symbol.for("react.server.reference");
myAction.$$id = "c67fa6a80e65945a14b1fac181d282d79bba49b7";
myAction.$$bound = [];
export const $ACTION_myAction = myAction;
export default function Page() {
    return <Button action={myAction}>Delete</Button>;
}
