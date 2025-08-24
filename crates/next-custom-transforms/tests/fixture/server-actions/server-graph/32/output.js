/* __next_internal_action_entry_do_not_use__ {"406a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export const $$RSC_SERVER_ACTION_0 = async function action($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    console.log($$ACTION_ARG_0.at(1), $$ACTION_ARG_1, $$ACTION_ARG_1.current);
    console.log($$ACTION_ARG_2.push.call($$ACTION_ARG_2, 5));
};
registerServerReference($$RSC_SERVER_ACTION_0, "406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
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
    var action = $$RSC_SERVER_ACTION_0.bind(null, encryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", data, baz.value, foo));
    return <form action={action}/>;
}
