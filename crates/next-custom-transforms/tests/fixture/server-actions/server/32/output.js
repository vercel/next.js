/* __next_internal_action_entry_do_not_use__ {"6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export function Component() {
    const data = [
        1,
        2,
        3
    ];
    const foo = [
        2,
        3,
        4
    ];
    const baz = {
        value: {
            current: 1
        }
    };
    var action = registerServerReference("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_0).bind(null, encryptActionBoundArgs("6d53ce510b2e36499b8f56038817b9bad86cabb4", [
        data,
        baz.value,
        foo
    ]));
    return <form action={action}/>;
}
export async function $$ACTION_0($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_CLOSURE_BOUND);
    console.log($$ACTION_ARG_0.at(1), $$ACTION_ARG_1, $$ACTION_ARG_1.current);
    console.log($$ACTION_ARG_2.push.call($$ACTION_ARG_2, 5));
}