import _JSXStyle from "styled-jsx/style";
export default class {
    render() {
        return <div className={_JSXStyle.dynamic([
            [
                "56eb85d11cc61daf",
                [
                    Typography.base.size.default,
                    Typography.base.lineHeight,
                    Target.mediumPlus,
                    Typography.base.size.mediumPlus,
                    Target.largePlus,
                    Typography.base.size.largePlus
                ]
            ]
        ])}>

          <p className={_JSXStyle.dynamic([
            [
                "56eb85d11cc61daf",
                [
                    Typography.base.size.default,
                    Typography.base.lineHeight,
                    Target.mediumPlus,
                    Typography.base.size.mediumPlus,
                    Target.largePlus,
                    Typography.base.size.largePlus
                ]
            ]
        ])}>test</p>

          <_JSXStyle id={"56eb85d11cc61daf"} dynamic={[
            Typography.base.size.default,
            Typography.base.lineHeight,
            Target.mediumPlus,
            Typography.base.size.mediumPlus,
            Target.largePlus,
            Typography.base.size.largePlus
        ]}>{`html{font-size:${Typography.base.size.default};line-height:${Typography.base.lineHeight}}@media ${Target.mediumPlus}{html{font-size:${Typography.base.size.mediumPlus}}}@media ${Target.largePlus}{html{font-size:${Typography.base.size.largePlus}}}`}</_JSXStyle>

        </div>;
    }
};
