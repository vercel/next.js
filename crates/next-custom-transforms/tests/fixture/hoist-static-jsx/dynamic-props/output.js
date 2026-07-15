import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Icon } from './icon';
const styles = {
    card: 'card'
};
const inputRef = {
    current: null
};
export function Card({ onClick }) {
    return /*#__PURE__*/ _jsxs("div", {
        className: styles.card,
        children: [
            /*#__PURE__*/ _jsx("button", {
                onClick: onClick,
                children: "x"
            }),
            /*#__PURE__*/ _jsx(Icon, {
                render: ()=>null
            }),
            /*#__PURE__*/ _jsx("div", {
                ...styles
            }),
            /*#__PURE__*/ _jsx("input", {
                ref: inputRef
            })
        ]
    });
}
