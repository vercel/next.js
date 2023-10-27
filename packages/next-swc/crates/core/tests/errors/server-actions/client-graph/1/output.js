/* __next_internal_client_entry_do_not_use__ default auto */ /* __next_internal_action_entry_do_not_use__ {"6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0"} */ import { createActionProxy } from "private-next-rsc-action-proxy";
export default function App() {
    async function fn(...args) {
        return $$ACTION_0.apply(null, (fn.$$bound || []).concat(args));
    }
    createActionProxy("6d53ce510b2e36499b8f56038817b9bad86cabb4", null, fn, $$ACTION_0);
    return <div>App</div>;
}
export async function $$ACTION_0() {}
