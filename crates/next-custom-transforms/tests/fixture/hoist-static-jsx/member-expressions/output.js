import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as Icons from './icons';
import styles from './page.module.css';
var _hoisted0;
const THEME = {
    accent: {
        color: 'teal'
    }
};
export function Hero({ items }) {
    return /*#__PURE__*/ _jsxs("section", {
        children: [
            _hoisted0 || (_hoisted0 = /*#__PURE__*/ _jsxs("div", {
                className: styles.card,
                children: [
                    /*#__PURE__*/ _jsx(Icons.Check, {
                        size: 16
                    }),
                    /*#__PURE__*/ _jsx("span", {
                        style: THEME.accent,
                        children: "ok"
                    }),
                    /*#__PURE__*/ _jsx("b", {
                        className: styles['card-title'],
                        children: "t"
                    })
                ]
            })),
            /*#__PURE__*/ _jsx("div", {
                className: styles[items.length],
                children: "x"
            }),
            /*#__PURE__*/ _jsx("div", {
                className: items.style,
                children: "y"
            })
        ]
    });
}
