import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
var _hoisted0;
const el = /*#__PURE__*/ _jsx("div", {
    className: "static"
});
export function Page() {
    const inner = ()=>_hoisted0 || (_hoisted0 = /*#__PURE__*/ _jsx("p", {
            children: "deep"
        }));
    return /*#__PURE__*/ _jsxs("section", {
        children: [
            el,
            inner()
        ]
    });
}
