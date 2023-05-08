/* __next_internal_action_entry_do_not_use__ $$ACTION_0 */ import __create_action_proxy__ from "private-next-rsc-action-proxy";
export default function Page({ foo , x , y  }) {
    async function action(...args) {
        return $$ACTION_0((action.$$bound || []).concat(args));
    }
    __create_action_proxy__("6d53ce510b2e36499b8f56038817b9bad86cabb4", [
        x
    ], action, $$ACTION_0);
    return action.bind(null, foo[0], foo[1], foo.x, foo[y]);
}
export async function $$ACTION_0(closure, a = closure[1], b = closure[2], c = closure[3], d = closure[4]) {
    console.log(a, b, closure[0], c, d);
}
