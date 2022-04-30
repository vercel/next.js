import _JSXStyle from "next/dist/shared/lib/styled-jsx";
export default class {
    render() {
        return <div className={_JSXStyle.dynamic([
            [
                "6021be0687550489",
                [
                    a || 'var(--c)',
                    b || 'inherit'
                ]
            ]
        ])}>

          <p className={_JSXStyle.dynamic([
            [
                "6021be0687550489",
                [
                    a || 'var(--c)',
                    b || 'inherit'
                ]
            ]
        ])}>test</p>

          <_JSXStyle id={"6021be0687550489"} dynamic={[
            a || 'var(--c)',
            b || 'inherit'
        ]}>{`.a:hover .b.__jsx-style-dynamic-selector{display:inline-block;padding:0 ${a || 'var(--c)'};color:${b || 'inherit'}}`}</_JSXStyle>

        </div>;
    }
};
