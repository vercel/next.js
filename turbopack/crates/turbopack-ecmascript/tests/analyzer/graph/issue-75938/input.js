"use client";
import { jsx as _jsx } from "https://esm.sh/preact/jsx-runtime";
import { useMemo } from "react";
import { fooBar } from "./external";
/** Add your relevant code here for the issue to reproduce */ export default function Home() {
    const helloWorld = useMemo(()=>new HelloWorld(), []);
    return /*#__PURE__*/ _jsx("button", {
        onClick: ()=>helloWorld.hi(),
        children: "Click me"
    });
}
class HelloWorld {
    hi() {
        this.#wrap(()=>{
            alert(fooBar());
        });
    }
    #wrap(cb) {
        return cb();
    }
}
