import _JSXStyle from "styled-jsx/style";
export default class {
    render() {
        return <div className={_JSXStyle.dynamic([
            [
                "60bda1963c17b640",
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
                "60bda1963c17b640",
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

          <_JSXStyle id={"60bda1963c17b640"} dynamic={[
            Typography.base.size.default,
            Typography.base.lineHeight,
            Target.mediumPlus,
            Typography.base.size.mediumPlus,
            Target.largePlus,
            Typography.base.size.largePlus
        ]}>{`html{font-size:${Typography.base.size.default};line-height:${Typography.base.lineHeight}}@media ${Target.mediumPlus}{html{font-size:${Typography.base.size.mediumPlus}}}@media ${Target.largePlus}{html{font-size:${Typography.base.size.largePlus}}}`}</_JSXStyle>

        </div>;
    }
}
