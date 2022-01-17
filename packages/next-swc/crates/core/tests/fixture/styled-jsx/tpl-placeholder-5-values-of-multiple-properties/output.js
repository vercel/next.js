import _JSXStyle from "styled-jsx/style";
export default class {
    render() {
        return <div className={_JSXStyle.dynamic([
            [
                "bcc606c168bcd197",
                [
                    a ? "100%" : "200px",
                    b ? "0" : "8px 20px"
                ]
            ]
        ])}>

          <p className={_JSXStyle.dynamic([
            [
                "bcc606c168bcd197",
                [
                    a ? "100%" : "200px",
                    b ? "0" : "8px 20px"
                ]
            ]
        ])}>test</p>

          <_JSXStyle id={"bcc606c168bcd197"} dynamic={[
            a ? "100%" : "200px",
            b ? "0" : "8px 20px"
        ]}>{`.item.__jsx-style-dynamic-selector{max-width:${a ? "100%" : "200px"};
padding:${b ? "0" : "8px 20px"}}`}</_JSXStyle>

        </div>;
    }
};
