/* __next_internal_action_entry_do_not_use__ $$ACTION_0,$$ACTION_2 */ import __create_action_proxy__ from "private-next-rsc-action-proxy";
import deleteFromDb from 'db';
export function Item({ id1 , id2  }) {
    async function deleteItem(...args) {
        return $$ACTION_0.apply(null, (deleteItem.$$bound || []).concat(args));
    }
    __create_action_proxy__("6d53ce510b2e36499b8f56038817b9bad86cabb4", [
        id1,
        id2
    ], deleteItem, $$ACTION_0);
    return <Button action={deleteItem}>Delete</Button>;
}
export async function $$ACTION_0($$ACTION_ARG_0, $$ACTION_ARG_1) {
    await deleteFromDb($$ACTION_ARG_0);
    await deleteFromDb($$ACTION_ARG_1);
}
export default function Home() {
    const info = {
        name: 'John',
        test: 'test'
    };
    const action = ($$ACTION_1 = async (...args)=>$$ACTION_2.apply(null, ($$ACTION_1.$$bound || []).concat(args)), __create_action_proxy__("9878bfa39811ca7650992850a8751f9591b6a557", [
        info.name,
        info.test
    ], $$ACTION_1, $$ACTION_2), $$ACTION_1);
    return null;
}
export var $$ACTION_2 = async ($$ACTION_ARG_0, $$ACTION_ARG_1)=>{
    console.log($$ACTION_ARG_0);
    console.log($$ACTION_ARG_1);
};
var $$ACTION_1;
