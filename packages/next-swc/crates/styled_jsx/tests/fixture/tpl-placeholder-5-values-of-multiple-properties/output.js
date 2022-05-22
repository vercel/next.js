import _JSXStyle from "next/dist/shared/lib/styled-jsx";
export default class {
    render() {
        return <div className={_JSXStyle.dynamic([
            [
                "e2cf1d088389269b",
                [
                    a ? '100%' : '200px',
                    b ? '0' : '8px 20px'
                ]
            ]
        ])}>

          <p className={_JSXStyle.dynamic([
            [
                "e2cf1d088389269b",
                [
                    a ? '100%' : '200px',
                    b ? '0' : '8px 20px'
                ]
            ]
        ])}>test</p>

          <_JSXStyle id={"e2cf1d088389269b"} dynamic={[
            a ? '100%' : '200px',
            b ? '0' : '8px 20px'
        ]}>{`.item.__jsx-style-dynamic-selector{max-width:${a ? '100%' : '200px'};padding:${b ? '0' : '8px 20px'}}`}</_JSXStyle>

        </div>;
    }
};
