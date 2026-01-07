/* __next_internal_action_entry_do_not_use__ {"ffab21efdafbe611287bc25c0462b1e0510d13e48b":"foo","ffac840dcaf5e8197cb02b7f3a43c119b7a770b272":"bar"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
// @ts-ignore
import { foo, bar } from './foo';
type Foo = {
};
type Bar = {
};
export { Foo };
export { type Bar };
let $$RSC_SERVER_CACHE_foo = foo;
if (typeof foo === "function") {
    $$RSC_SERVER_CACHE_foo = $$reactCache__(function() {
        return $$cache__("default", "ffab21efdafbe611287bc25c0462b1e0510d13e48b", 0, foo, Array.prototype.slice.call(arguments));
    });
    registerServerReference($$RSC_SERVER_CACHE_foo, "ffab21efdafbe611287bc25c0462b1e0510d13e48b", null);
    Object["defineProperty"]($$RSC_SERVER_CACHE_foo, "name", {
        value: "foo"
    });
}
export { $$RSC_SERVER_CACHE_foo as foo };
let $$RSC_SERVER_CACHE_bar = bar;
if (typeof bar === "function") {
    $$RSC_SERVER_CACHE_bar = $$reactCache__(function() {
        return $$cache__("default", "ffac840dcaf5e8197cb02b7f3a43c119b7a770b272", 0, bar, Array.prototype.slice.call(arguments));
    });
    registerServerReference($$RSC_SERVER_CACHE_bar, "ffac840dcaf5e8197cb02b7f3a43c119b7a770b272", null);
    Object["defineProperty"]($$RSC_SERVER_CACHE_bar, "name", {
        value: "bar"
    });
}
export { $$RSC_SERVER_CACHE_bar as bar };
