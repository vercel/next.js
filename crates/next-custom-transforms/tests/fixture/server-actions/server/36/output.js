/* __next_internal_action_entry_do_not_use__ {"13b8d938e0b5d65efdfc56c4efafdae4448a1102":"$$CACHE_1","b82aa8810dfc5a728750e183ef32da0c67809645":"$$CACHE_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $cache } from "private-next-rsc-cache-wrapper";
export var $$CACHE_0 = $cache("default", "b82aa8810dfc5a728750e183ef32da0c67809645", async function foo() {
    return 'data A';
});
export var foo = registerServerReference("b82aa8810dfc5a728750e183ef32da0c67809645", $$CACHE_0);
export var $$CACHE_1 = $cache("default", "13b8d938e0b5d65efdfc56c4efafdae4448a1102", async function bar() {
    return 'data B';
});
export var bar = registerServerReference("13b8d938e0b5d65efdfc56c4efafdae4448a1102", $$CACHE_1);