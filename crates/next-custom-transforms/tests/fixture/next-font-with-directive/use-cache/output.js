/* __next_internal_action_entry_do_not_use__ {"c0dd5bb6fef67f5ab84327f5164ac2c3111a159337":"$$RSC_SERVER_CACHE_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
import { cache as $$reactCache__ } from "react";
import React from 'react';
import inter from '@next/font/google/target.css?{"path":"app/test.tsx","import":"Inter","arguments":[],"variableName":"inter"}';
const $$RSC_SERVER_CACHE_0_INNER = async function Cached({ children }) {
    return <div className={inter.className}>{children}</div>;
};
export var $$RSC_SERVER_CACHE_0 = $$reactCache__(function Cached() {
    return $$cache__("default", "c0dd5bb6fef67f5ab84327f5164ac2c3111a159337", 0, $$RSC_SERVER_CACHE_0_INNER, Array.prototype.slice.call(arguments, 0, 1));
});
registerServerReference($$RSC_SERVER_CACHE_0, "c0dd5bb6fef67f5ab84327f5164ac2c3111a159337", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_0, "name", {
    value: "Cached"
});
export var Cached = $$RSC_SERVER_CACHE_0;
