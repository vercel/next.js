/* __next_internal_action_entry_do_not_use__ {"001c36b06e398c97abe5d5d7ae8c672bfddf4e1b91":"$$RSC_SERVER_ACTION_2","006a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","0090b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1","009ed0cc47abc4e1c64320cf42b74ae60b58c40f00":"$$RSC_SERVER_ACTION_3","00a9b2939c1f39073a6bed227fd20233064c8b7869":"$$RSC_SERVER_ACTION_4"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { Form } from './form';
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_0 = async function foo() {
    return 'declarator arrow function expression';
};
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_1 = async function bar() {
    return 'function declaration';
};
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_2 = async function action() {
    return 'arrow function expression';
};
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_3 = async function action() {
    return 'anonymous function expression';
};
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_4 = async function baz() {
    return 'named function expression';
};
export default function Page() {
    const foo = registerServerReference($$RSC_SERVER_ACTION_0, "006a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
    var bar = registerServerReference($$RSC_SERVER_ACTION_1, "0090b5db271335765a4b0eab01f044b381b5ebd5cd", null);
    return <>
      <Form action={foo}/>
      <Form action={bar}/>
      <Form action={registerServerReference($$RSC_SERVER_ACTION_2, "001c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", null)}/>
      <Form action={registerServerReference($$RSC_SERVER_ACTION_3, "009ed0cc47abc4e1c64320cf42b74ae60b58c40f00", null)}/>
      <Form action={registerServerReference($$RSC_SERVER_ACTION_4, "00a9b2939c1f39073a6bed227fd20233064c8b7869", null)}/>
    </>;
}
