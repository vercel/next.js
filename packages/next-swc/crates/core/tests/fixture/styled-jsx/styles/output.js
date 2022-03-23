import _JSXStyle from "styled-jsx/style";
import colors, { size } from './constants';
const color = 'red';
const bar = new String("div.jsx-aaed0341accea8f{font-size:3em}");
bar.__hash = "aaed0341accea8f";
const baz = new String("div{font-size:3em}");
baz.__hash = "aaed0341accea8f";
const a = new String(`div{font-size:${size}em}`);
a.__hash = "a0b0bfa04065ce9d";
export const uh = bar;
export const foo = new String(`div.jsx-40e01c278585442b{color:${color}}`);
foo.__hash = "40e01c278585442b";
({
    styles: <_JSXStyle id={"1864b70fe66c4fb5"}>{`div.jsx-1864b70fe66c4fb5{color:${colors.green.light}}a.jsx-1864b70fe66c4fb5{color:red}`}</_JSXStyle>,
    className: "jsx-1864b70fe66c4fb5"
});
const b = {
    styles: <_JSXStyle id={"1864b70fe66c4fb5"}>{`div.jsx-1864b70fe66c4fb5{color:${colors.green.light}}a.jsx-1864b70fe66c4fb5{color:red}`}</_JSXStyle>,
    className: "jsx-1864b70fe66c4fb5"
};
const dynamic = (colors1)=>{
    const b = {
        styles: <_JSXStyle id={"6739b456a2832bc7"} dynamic={[
            colors1.green.light
        ]}>{`div.__jsx-style-dynamic-selector{color:${colors1.green.light}}a.__jsx-style-dynamic-selector{color:red}`}</_JSXStyle>,
        className: _JSXStyle.dynamic([
            [
                "6739b456a2832bc7",
                [
                    colors1.green.light
                ]
            ]
        ])
    };
};
export default {
    styles: <_JSXStyle id={"8f298dcba20b7575"}>{`div.jsx-8f298dcba20b7575{font-size:3em}p.jsx-8f298dcba20b7575{color:${color}}`}</_JSXStyle>,
    className: "jsx-8f298dcba20b7575"
};
