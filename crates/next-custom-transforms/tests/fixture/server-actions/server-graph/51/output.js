/* __next_internal_action_entry_do_not_use__ {"601c36b06e398c97abe5d5d7ae8c672bfddf4e1b91":"$$RSC_SERVER_ACTION_2","6090b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1","706a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
export const $$RSC_SERVER_ACTION_0 = async function(a, b, c) {
    return <div>
      {a}
      {b}
      {c}
    </div>;
};
registerServerReference($$RSC_SERVER_ACTION_0, "706a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
export default $$RSC_SERVER_ACTION_0;
export const $$RSC_SERVER_ACTION_1 = async function foo(a, b) {
    return <div>
      {a}
      {b}
    </div>;
};
registerServerReference($$RSC_SERVER_ACTION_1, "6090b5db271335765a4b0eab01f044b381b5ebd5cd", null);
export var foo = $$RSC_SERVER_ACTION_1;
export const $$RSC_SERVER_ACTION_2 = async function bar(a, b) {
    return <div>
      {a}
      {b}
    </div>;
};
registerServerReference($$RSC_SERVER_ACTION_2, "601c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", null);
export const bar = $$RSC_SERVER_ACTION_2;
