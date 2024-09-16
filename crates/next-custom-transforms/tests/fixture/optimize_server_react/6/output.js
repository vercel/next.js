import { useState, useEffect, useLayoutEffect } from 'react';
import React from 'react';
const Component = ({ children, fallback })=>{
    const [mounted, setMounted] = [
        false,
        ()=>null
    ];
    process.env.__NEXT_PRIVATE_MINIMIZE_MARCO_FALSE && useEffect(()=>setMounted(true), []);
    if (!mounted) {
        return fallback ?? /* @__PURE__ */ jsx(Fragment, {});
    }
    return children;
};
export { Component };
