import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Badge } from './badge';
var _hoisted0;
const CONFIG = {
    compact: true
};
export function Panel() {
    return _hoisted0 || (_hoisted0 = /*#__PURE__*/ _jsxs("section", {
        children: [
            /*#__PURE__*/ _jsx(Badge, {
                items: [
                    'a',
                    'b'
                ]
            }),
            /*#__PURE__*/ _jsx(Badge, {
                config: {
                    compact: true
                }
            }),
            /*#__PURE__*/ _jsx(Badge, {
                config: CONFIG
            }),
            /*#__PURE__*/ _jsx(Badge, {
                children: /*#__PURE__*/ _jsx("em", {
                    children: "one"
                })
            }),
            /*#__PURE__*/ _jsxs(Badge, {
                children: [
                    /*#__PURE__*/ _jsx("em", {
                        children: "one"
                    }),
                    /*#__PURE__*/ _jsx("em", {
                        children: "two"
                    })
                ]
            }),
            /*#__PURE__*/ _jsx("div", {
                style: {
                    width: 100
                }
            })
        ]
    }));
}
