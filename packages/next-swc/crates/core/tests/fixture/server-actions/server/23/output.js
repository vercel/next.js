/* __next_internal_action_entry_do_not_use__ $$ACTION_0,$$ACTION_2 */ import __create_action_proxy__ from "private-next-rsc-action-proxy";
export default function Page({ foo , x , y  }) {
    async function action(...args) {
        return $$ACTION_0.apply(null, (action.$$bound || []).concat(args));
    }
    __create_action_proxy__("6d53ce510b2e36499b8f56038817b9bad86cabb4", [
        x
    ], action, $$ACTION_0);
    action.bind(null, foo[0], foo[1], foo.x, foo[y]);
    const action2 = ($$ACTION_1 = async (...args)=>$$ACTION_2.apply(null, ($$ACTION_1.$$bound || []).concat(args)), __create_action_proxy__("9878bfa39811ca7650992850a8751f9591b6a557", [
        x
    ], $$ACTION_1, $$ACTION_2), $$ACTION_1);
    action2.bind(null, foo[0], foo[1], foo.x, foo[y]);
}
export async function $$ACTION_0(x, a, b, c, d) {
    console.log(a, b, x, c, d);
}
export const $$ACTION_2 = async (x, a, b, c, d)=>{
    console.log(a, b, x, c, d);
};
var $$ACTION_1;
