import { useState, useEffect, useLayoutEffect } from 'react';
import React from 'react';
const Component = ({ children, fallback })=>{
    const [mounted, setMounted] = [
        false,
        ()=>null
    ];
    process.env.NODE_ENV !== "production" ? useEffect(()=>setMounted(true), []) : null;
    if (!mounted) {
        return fallback ?? /* @__PURE__ */ jsx(Fragment, {});
    }
    return children;
};
export { Component };
