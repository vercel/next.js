import _JSXStyle from "styled-jsx/style";
import colors, { size } from './constants';
const color = 'red';
const bar = new String("div.jsx-aaed0341accea8f{font-size:3em}");
bar.__hash = "aaed0341accea8f";
const baz = new String("div{font-size:3em}");
baz.__hash = "aaed0341accea8f";
const a = new String(`div{font-size:${size}em}`);
a.__hash = "3066b487d298d78f";
export const uh = bar;
export const foo = new String(`div.jsx-67354fc16554bdab{color:${color}}`);
foo.__hash = "67354fc16554bdab";
({
    styles: <_JSXStyle id={"ef44b0e76b4e59a2"}>{`div.jsx-ef44b0e76b4e59a2{color:${colors.green.light}}a.jsx-ef44b0e76b4e59a2{color:red}`}</_JSXStyle>,
    className: "jsx-ef44b0e76b4e59a2"
});
const b = {
    styles: <_JSXStyle id={"ef44b0e76b4e59a2"}>{`div.jsx-ef44b0e76b4e59a2{color:${colors.green.light}}a.jsx-ef44b0e76b4e59a2{color:red}`}</_JSXStyle>,
    className: "jsx-ef44b0e76b4e59a2"
};
const dynamic = (colors1)=>{
    const b = {
        styles: <_JSXStyle id={"d1249fb76dde6727"} dynamic={[
            colors1.green.light
        ]}>{`div.__jsx-style-dynamic-selector{color:${colors1.green.light}}a.__jsx-style-dynamic-selector{color:red}`}</_JSXStyle>,
        className: _JSXStyle.dynamic([
            [
                "d1249fb76dde6727",
                [
                    colors1.green.light
                ]
            ]
        ])
    };
};
export default {
    styles: <_JSXStyle id={"d85f88350ca31aae"}>{`div.jsx-d85f88350ca31aae{font-size:3em}p.jsx-d85f88350ca31aae{color:${color}}`}</_JSXStyle>,
    className: "jsx-d85f88350ca31aae"
};
