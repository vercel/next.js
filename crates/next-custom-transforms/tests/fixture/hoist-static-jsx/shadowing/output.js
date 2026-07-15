import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
var _hoisted0;
const title = 'static';
export function Page({ items }) {
    const rows = items.map((title)=>/*#__PURE__*/ _jsx("h2", {
            className: "row",
            children: title
        }));
    return /*#__PURE__*/ _jsxs("article", {
        children: [
            _hoisted0 || (_hoisted0 = /*#__PURE__*/ _jsx("h1", {
                children: title
            })),
            rows
        ]
    });
}
