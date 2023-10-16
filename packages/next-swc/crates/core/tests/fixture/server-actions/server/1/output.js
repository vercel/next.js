/* __next_internal_action_entry_do_not_use__ {"6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0","9878bfa39811ca7650992850a8751f9591b6a557":"$$ACTION_2"} */ import { createActionProxy, encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-proxy";
import deleteFromDb from 'db';
export function Item({ id1, id2 }) {
    async function deleteItem(...args) {
        return $$ACTION_0.apply(null, (deleteItem.$$bound || []).concat(args));
    }
    createActionProxy("6d53ce510b2e36499b8f56038817b9bad86cabb4", [
        encryptActionBoundArgs([
            id1,
            id2
        ])
    ], deleteItem, $$ACTION_0);
    return <Button action={deleteItem}>Delete</Button>;
}
export async function $$ACTION_0($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs($$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0);
    await deleteFromDb($$ACTION_ARG_1);
}
$$ACTION_0.$$closure_args = 2;
export default function Home() {
    const info = {
        name: 'John',
        test: 'test'
    };
    const action = ($$ACTION_1 = async (...args)=>$$ACTION_2.apply(null, ($$ACTION_1.$$bound || []).concat(args)), createActionProxy("9878bfa39811ca7650992850a8751f9591b6a557", [
        encryptActionBoundArgs([
            info.name,
            info.test
        ])
    ], $$ACTION_1, $$ACTION_2), $$ACTION_1);
    return null;
}
export var $$ACTION_2 = async ($$ACTION_CLOSURE_BOUND)=>{
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs($$ACTION_CLOSURE_BOUND);
    console.log($$ACTION_ARG_0);
    console.log($$ACTION_ARG_1);
};
$$ACTION_2.$$closure_args = 2;
var $$ACTION_1;
