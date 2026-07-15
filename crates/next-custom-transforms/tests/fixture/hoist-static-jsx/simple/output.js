import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
var _hoisted0;
export function Page({ title }) {
    return /*#__PURE__*/ _jsxs("main", {
        children: [
            /*#__PURE__*/ _jsx("h1", {
                children: title
            }),
            _hoisted0 || (_hoisted0 = /*#__PURE__*/ _jsxs("div", {
                className: "hero",
                children: [
                    /*#__PURE__*/ _jsx("h2", {
                        children: "Welcome"
                    }),
                    /*#__PURE__*/ _jsx("p", {
                        children: "Static content"
                    })
                ]
            }))
        ]
    });
}
