/* __next_internal_action_entry_do_not_use__ {"9878bfa39811ca7650992850a8751f9591b6a557":"$$ACTION_2","6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0"} */ import { createActionProxy, encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-proxy";
async function myAction(...args) {
    return $$ACTION_0.apply(null, (myAction.$$bound || []).concat(args));
}
createActionProxy("6d53ce510b2e36499b8f56038817b9bad86cabb4", null, myAction, $$ACTION_0);
export async function $$ACTION_0(a, b, c) {
    console.log('a');
}
$$ACTION_0.$$closure_args = 0;
export default function Page() {
    return <Button action={myAction}>Delete</Button>;
}
export const action = withValidate(($$ACTION_1 = async (...args)=>$$ACTION_2.apply(null, ($$ACTION_1.$$bound || []).concat(args)), createActionProxy("9878bfa39811ca7650992850a8751f9591b6a557", null, $$ACTION_1, $$ACTION_2), $$ACTION_1));
export var $$ACTION_2 = async ()=>{};
$$ACTION_2.$$closure_args = 0;
var $$ACTION_1;
