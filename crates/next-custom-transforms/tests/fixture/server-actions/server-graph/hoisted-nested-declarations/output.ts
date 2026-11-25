/* __next_internal_action_entry_do_not_use__ {"406262ebc12d4ebf7857b59d80dabe8161f7d6f072":{"name":"$$RSC_SERVER_ACTION_6"},"406a88810ecce4a4e8b59d53b8327d7e98bbf251d7":{"name":"$$RSC_SERVER_ACTION_0"},"40a9b2939c1f39073a6bed227fd20233064c8b7869":{"name":"$$RSC_SERVER_ACTION_4"},"8069348c79fce073bae2f70f139565a2fda1c74c74":{"name":"$$RSC_SERVER_CACHE_2"},"8094af7e7cfc792db88b46275e6aca3bd5744f4b1e":{"name":"$$RSC_SERVER_CACHE_7"},"80951c375b4a6a6e89d67b743ec5808127cfde405d":{"name":"$$RSC_SERVER_CACHE_1"},"c0471a5eb0be1c31686dd4ba938a80328b80b1615d":{"name":"$$RSC_SERVER_CACHE_5"},"e012a8d21b6362b4cc8f5b15560525095bc48dba80":{"name":"$$RSC_SERVER_CACHE_3"}} */ 'use strict';
import { registerServerReference, bindServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
export const $$RSC_SERVER_ACTION_0 = /*#__PURE__*/ registerServerReference(async function inlineAction(value: string) {
    return value;
}, "406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
var inlineAction = $$RSC_SERVER_ACTION_0;
const $$RSC_SERVER_CACHE_1_INNER = async function defaultCached() {
    return 'default';
};
export var $$RSC_SERVER_CACHE_1 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function defaultCached() {
    return $$cache__("default", "80951c375b4a6a6e89d67b743ec5808127cfde405d", 0, $$RSC_SERVER_CACHE_1_INNER, []);
}), "80951c375b4a6a6e89d67b743ec5808127cfde405d", null), "name", {
    value: "defaultCached"
});
var defaultCached = $$RSC_SERVER_CACHE_1;
const $$RSC_SERVER_CACHE_2_INNER = async function bar() {
    return 1234;
};
export var $$RSC_SERVER_CACHE_2 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function bar() {
    return $$cache__("default", "8069348c79fce073bae2f70f139565a2fda1c74c74", 0, $$RSC_SERVER_CACHE_2_INNER, []);
}), "8069348c79fce073bae2f70f139565a2fda1c74c74", null), "name", {
    value: "bar"
});
const $$RSC_SERVER_CACHE_3_INNER = async function formatGreeting([$$ACTION_ARG_0], suffix: string) {
    return $$ACTION_ARG_0 + suffix;
};
export var $$RSC_SERVER_CACHE_3 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function formatGreeting() {
    return $$cache__("default", "e012a8d21b6362b4cc8f5b15560525095bc48dba80", 1, $$RSC_SERVER_CACHE_3_INNER, Array.prototype.slice.call(arguments, 0, 2));
}), "e012a8d21b6362b4cc8f5b15560525095bc48dba80", null), "name", {
    value: "formatGreeting"
});
export const $$RSC_SERVER_ACTION_4 = /*#__PURE__*/ registerServerReference(async function formatAction($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("40a9b2939c1f39073a6bed227fd20233064c8b7869", $$ACTION_CLOSURE_BOUND);
    return $$ACTION_ARG_0('?');
}, "40a9b2939c1f39073a6bed227fd20233064c8b7869", null);
const $$RSC_SERVER_CACHE_5_INNER = async function inIf([$$ACTION_ARG_0]) {
    return $$ACTION_ARG_0;
};
export var $$RSC_SERVER_CACHE_5 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function inIf() {
    return $$cache__("default", "c0471a5eb0be1c31686dd4ba938a80328b80b1615d", 1, $$RSC_SERVER_CACHE_5_INNER, Array.prototype.slice.call(arguments, 0, 1));
}), "c0471a5eb0be1c31686dd4ba938a80328b80b1615d", null), "name", {
    value: "inIf"
});
export const $$RSC_SERVER_ACTION_6 = /*#__PURE__*/ registerServerReference(async function inLoop($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("406262ebc12d4ebf7857b59d80dabe8161f7d6f072", $$ACTION_CLOSURE_BOUND);
    return $$ACTION_ARG_0[$$ACTION_ARG_1];
}, "406262ebc12d4ebf7857b59d80dabe8161f7d6f072", null);
const $$RSC_SERVER_CACHE_7_INNER = async function inSwitch() {
    return 'switch';
};
export var $$RSC_SERVER_CACHE_7 = /*#__PURE__*/ Object["defineProperty"](/*#__PURE__*/ registerServerReference(/*#__PURE__*/ $$reactCache__(function inSwitch() {
    return $$cache__("default", "8094af7e7cfc792db88b46275e6aca3bd5744f4b1e", 0, $$RSC_SERVER_CACHE_7_INNER, []);
}), "8094af7e7cfc792db88b46275e6aca3bd5744f4b1e", null), "name", {
    value: "inSwitch"
});
export const runServer = inlineAction;
export const runDefault = defaultCached;
export default defaultCached;
export function nestedNoClosure() {
    var bar = $$RSC_SERVER_CACHE_2;
    return bar();
}
export function nestedWithClosure(name: string) {
    var formatGreeting = /*#__PURE__*/ bindServerReference($$RSC_SERVER_CACHE_3, ()=>encryptActionBoundArgs("e012a8d21b6362b4cc8f5b15560525095bc48dba80", greeting));
    var formatAction = /*#__PURE__*/ bindServerReference($$RSC_SERVER_ACTION_4, ()=>encryptActionBoundArgs("40a9b2939c1f39073a6bed227fd20233064c8b7869", formatGreeting));
    const ref = formatGreeting;
    const bound = formatGreeting.bind(null, '!');
    let greeting = `Hello, ${name}`;
    greeting += '!';
    return [
        ref,
        bound,
        formatAction
    ];
}
export function blockAndLoopScoped(items: string[], cond: boolean) {
    const results: Array<() => Promise<string>> = [];
    if (cond) {
        let inIf = /*#__PURE__*/ bindServerReference($$RSC_SERVER_CACHE_5, ()=>encryptActionBoundArgs("c0471a5eb0be1c31686dd4ba938a80328b80b1615d", tag));
        results.push(inIf);
        const tag = 'if';
    }
    for(let i = 0; i < items.length; i++){
        let inLoop = /*#__PURE__*/ bindServerReference($$RSC_SERVER_ACTION_6, ()=>encryptActionBoundArgs("406262ebc12d4ebf7857b59d80dabe8161f7d6f072", items, i));
        results.push(inLoop);
    }
    {
        let inSwitch = $$RSC_SERVER_CACHE_7;
        switch(items.length){
            case 1:
                results.push(inSwitch);
                break;
        }
    }
    return results;
}
