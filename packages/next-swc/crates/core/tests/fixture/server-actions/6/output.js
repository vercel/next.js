/* __next_internal_action_entry_do_not_use__ $ACTION_action */ import f, { f1, f2 } from 'foo';
const f3 = 1;
var f4;
let f5;
const [f6, [f7, ...f8], { f9  }, { f10 , f11: [f12] , f13: f14 , f15: { f16  } , ...f17 }, ...f18] = [];
if (true) {
    const g19 = 1;
}
function x() {
    const f2 = 1;
    const g20 = 1;
}
export function y(p) {
    const f2 = 1;
    const f11 = 1;
    const f19 = 1;
    if (true) {
        const f8 = 1;
    }
    async function action() {
        return $ACTION_action(action.$$closure);
    }
    action.$$typeof = Symbol.for("react.server.reference");
    action.$$filepath = "/app/item.js";
    action.$$name = "$ACTION_action";
    action.$$closure = [
        f2,
        f11,
        p.a,
        p['b'],
        p[1],
    ];
    return <Button action={action}>Delete</Button>;
}
export async function $ACTION_action(closure) {
    const f17 = 1;
    if (true) {
        const f18 = 1;
        const f19 = 1;
    }
    console.log(f, f1, closure[0], f3, f4, f5, f6, f7, f8, closure[0](f9), f12, closure[1], f16.x, f17, f18, closure[2], closure[3], closure[4], g19, g20, globalThis);
}