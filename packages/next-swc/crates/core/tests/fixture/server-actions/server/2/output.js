/* __next_internal_action_entry_do_not_use__ $$ACTION_0,$$ACTION_2 */ import __create_action_proxy__ from "private-next-rsc-action-proxy";
async function myAction(...args) {
    return $$ACTION_0.apply(null, (myAction.$$bound || []).concat(args));
}
__create_action_proxy__("6d53ce510b2e36499b8f56038817b9bad86cabb4", null, myAction, $$ACTION_0);
export async function $$ACTION_0(a, b, c) {
    console.log('a');
}
export default function Page() {
    return <Button action={myAction}>Delete</Button>;
}
export const action = withValidate(($$ACTION_1 = async (...args)=>$$ACTION_2.apply(null, ($$ACTION_1.$$bound || []).concat(args)), __create_action_proxy__("9878bfa39811ca7650992850a8751f9591b6a557", null, $$ACTION_1, $$ACTION_2), $$ACTION_1));
export var $$ACTION_2 = async ()=>{};
var $$ACTION_1;