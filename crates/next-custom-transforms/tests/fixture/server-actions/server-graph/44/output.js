/* __next_internal_action_entry_do_not_use__ {"001c36b06e398c97abe5d5d7ae8c672bfddf4e1b91":"$$RSC_SERVER_ACTION_2","006a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","0090b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1","009ed0cc47abc4e1c64320cf42b74ae60b58c40f00":"$$RSC_SERVER_ACTION_3","00a9b2939c1f39073a6bed227fd20233064c8b7869":"$$RSC_SERVER_ACTION_4"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { Form } from 'components';
export const $$RSC_SERVER_ACTION_0 = async function foo() {
    return 'declarator arrow function expression';
};
registerServerReference($$RSC_SERVER_ACTION_0, "006a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
export const $$RSC_SERVER_ACTION_1 = async function bar() {
    return 'function declaration';
};
registerServerReference($$RSC_SERVER_ACTION_1, "0090b5db271335765a4b0eab01f044b381b5ebd5cd", null);
export const $$RSC_SERVER_ACTION_2 = async function action() {
    return 'arrow function expression';
};
registerServerReference($$RSC_SERVER_ACTION_2, "001c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", null);
export const $$RSC_SERVER_ACTION_3 = async function action() {
    return 'anonymous function expression';
};
registerServerReference($$RSC_SERVER_ACTION_3, "009ed0cc47abc4e1c64320cf42b74ae60b58c40f00", null);
export const $$RSC_SERVER_ACTION_4 = async function baz() {
    return 'named function expression';
};
registerServerReference($$RSC_SERVER_ACTION_4, "00a9b2939c1f39073a6bed227fd20233064c8b7869", null);
export default function Page() {
    const foo = $$RSC_SERVER_ACTION_0;
    var bar = $$RSC_SERVER_ACTION_1;
    return <>
      <Form action={foo}/>
      <Form action={bar}/>
      <Form action={$$RSC_SERVER_ACTION_2}/>
      <Form action={$$RSC_SERVER_ACTION_3}/>
      <Form action={$$RSC_SERVER_ACTION_4}/>
    </>;
}
