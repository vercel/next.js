import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
var _hoisted0;
const label = 'count';
let count = 0;
count += 1;
export function Counter() {
    return /*#__PURE__*/ _jsxs("span", {
        children: [
            _hoisted0 || (_hoisted0 = /*#__PURE__*/ _jsx("b", {
                children: label
            })),
            /*#__PURE__*/ _jsx("i", {
                children: count
            })
        ]
    });
}
