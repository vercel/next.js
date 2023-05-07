/* __next_internal_action_entry_do_not_use__ $$ACTION_0 */ export default function Page({ foo , x , y  }) {
    async function action(a, b, c, d) {
        return $$ACTION_0(action.$$bound);
    }
    action.$$typeof = Symbol.for("react.server.reference");
    action.$$id = "6d53ce510b2e36499b8f56038817b9bad86cabb4";
    action.$$bound = [
        x
    ];
    return $$ACTION_1 = async ()=>$$ACTION_0($$ACTION_1.$$bound), $$ACTION_1.$$typeof = Symbol.for("react.server.reference"), $$ACTION_1.$$id = action.$$id, $$ACTION_1.$$bound = [
        foo[0],
        foo[1],
        foo.x,
        foo[y]
    ], $$ACTION_1.$$bound = (action.$$bound || []).concat($$ACTION_1.$$bound), $$ACTION_1;
}
export async function $$ACTION_0(closure, a = closure[1], b = closure[2], c = closure[3], d = closure[4]) {
    console.log(a, b, closure[0], c, d);
}
var $$ACTION_1;