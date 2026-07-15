import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Badge } from './badge';
var _hoisted0;
const TITLE = 'Hello';
const SIZE = 16;
export function Header() {
    return _hoisted0 || (_hoisted0 = /*#__PURE__*/ _jsxs("header", {
        children: [
            /*#__PURE__*/ _jsx(Badge, {
                title: TITLE,
                size: SIZE,
                "aria-hidden": true,
                label: undefined,
                items: [
                    'a',
                    'b'
                ],
                config: {
                    nested: {
                        deep: true
                    }
                }
            }),
            /*#__PURE__*/ _jsx(Badge, {
                title: `literal`
            })
        ]
    }));
}
