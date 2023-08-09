import { useState, useEffect } from 'react';
import { Root, Children, JSXMemberExpression, AttributeValue, AttributeJSX, ValueInRender, ValueInEffect } from '../';
export var __N_SSG = true;
export default function Test() {
    const [x, setX] = useState(ValueInRender.value);
    useEffect(()=>{
        setX(ValueInEffect.value);
    }, []);
    return __jsx(Root, {
        x: x
    }, __jsx("div", null, __jsx(Children, {
        attr: AttributeValue,
        jsx: __jsx(AttributeJSX, null)
    }), __jsx(JSXMemberExpression.Deep.Property, null)));
}
