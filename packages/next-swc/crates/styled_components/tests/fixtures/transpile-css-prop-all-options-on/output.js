import styled from 'styled-components';
import SomeComponent from '../SomeComponentPath';
const { SomeOtherComponent  } = require('../SomeOtherComponentPath');
/**
 * control
 */ const Thing = styled.div.withConfig({
    displayName: "code__Thing",
    componentId: "sc-867225be-0"
})`
  color: red;
`;
const Thing2 = styled(Thing).withConfig({
    displayName: "code__Thing2",
    componentId: "sc-867225be-1"
})`
  background: blue;
`;
/*
 * Basic fixtures
 */ const StaticString = (p)=><_StyledP >A</_StyledP>;
const StaticTemplate = (p)=><_StyledP2 >

    A

  </_StyledP2>;
const ObjectProp = (p)=><_StyledP3 >A</_StyledP3>;
const NoChildren = (p)=><_StyledP4 />;
const CssHelperProp = (p)=><_StyledP5 >

    A

  </_StyledP5>;
/*
 * Dynamic prop
 */ const CustomComp = (p)=><_StyledParagraph >H</_StyledParagraph>;
const DynamicProp = (p)=><_StyledP6 $_css={props.cssText}>H</_StyledP6>;
const LocalInterpolation = (p)=><_StyledP7 $_css2={props.bg}>

    H

  </_StyledP7>;
const FuncInterpolation = (p)=><_StyledP8 >

    H

  </_StyledP8>;
const radius = 10;
const GlobalInterpolation = (p)=><_StyledP9 >

    H

  </_StyledP9>;
const LocalCssHelperProp = (p)=><_StyledP10 $_css3={p.color}>

    A

  </_StyledP10>;
const DynamicCssHelperProp = (p)=><_StyledP11 >

    A

  </_StyledP11>;
const CustomCompWithDot = (p)=><_StyledButtonGhost >H</_StyledButtonGhost>;
const NestedCompWithDot = (p)=><_StyledButtonGhostNew >H</_StyledButtonGhostNew>;
const CustomCompWithDotLowerCase = (p)=><_StyledButtonGhost2 >H</_StyledButtonGhost2>;
const CustomElement = (p)=><_StyledButtonGhost3 >H</_StyledButtonGhost3>;
const globalVar = '"foo"';
const getAfterValue = ()=>'"bar"';
const ObjectPropMixedInputs = (p)=>{
    const color = 'red';
    return <_StyledP12 $_css4={p.background} $_css5={color} $_css6={globalVar} $_css7={getAfterValue()}>

      A

    </_StyledP12>;
};
const SpreadObjectPropMixedInputs = (p)=>{
    const color = 'red';
    return <_StyledP13 $_css8={globalVar} $_css9={getAfterValue()} $_css10={globalVar} $_css11={getAfterValue()} $_css12={p.background} $_css13={globalVar} $_css14={getAfterValue()}>

      A

    </_StyledP13>;
};
/* styled component defined after function it's used in */ const EarlyUsageComponent = (p)=><_StyledThing />;
const Thing3 = styled.div.withConfig({
    displayName: "code__Thing3",
    componentId: "sc-867225be-2"
})`
  color: blue;
`;
var _StyledThing6 = styled(Thing3).withConfig({
    displayName: "code___StyledThing6",
    componentId: "sc-867225be-3"
})((p)=>({
        [p.$_css19]: {
            color: 'red'
        }
    }));
var _StyledThing5 = styled(Thing3).withConfig({
    displayName: "code___StyledThing5",
    componentId: "sc-867225be-4"
})((p)=>({
        [p.$_css18]: {
            color: 'red'
        }
    }));
var _StyledThing4 = styled(Thing3).withConfig({
    displayName: "code___StyledThing4",
    componentId: "sc-867225be-5"
})((p)=>({
        [p.$_css17]: {
            color: 'red'
        }
    }));
var _StyledThing3 = styled(Thing3).withConfig({
    displayName: "code___StyledThing3",
    componentId: "sc-867225be-6"
})((p)=>({
        color: p.$_css16
    }));
var _StyledThing = styled(Thing3).withConfig({
    displayName: "code___StyledThing",
    componentId: "sc-867225be-7"
})`color: red;`;
const EarlyUsageComponent2 = (p)=><_StyledThing2 />;
function Thing4(props1) {
    return <div {...props1}/>;
}
/* insert before usage for non-local scope styled HOC targets */ const ImportedComponentUsage = (p)=><_StyledSomeComponent />;
const RequiredComponentUsage = (p)=><_StyledSomeOtherComponent />;
const ObjectInterpolation = (p)=>{
    const theme = useTheme();
    return <_StyledP14 $_css15={theme.colors.red}>

      H

    </_StyledP14>;
};
const ObjectInterpolationCustomComponent = (p)=>{
    const theme = useTheme();
    return <_StyledThing3 $_css16={theme.colors.red}>

      H

    </_StyledThing3>;
};
const ObjectInterpolationInKey = (p)=>{
    const theme = useTheme();
    return <_StyledThing4 $_css17={theme.breakpoints.md}>

      H

    </_StyledThing4>;
};
const ObjectFnInterpolationInKey = (p)=>{
    const theme = useTheme();
    return <_StyledThing5 $_css18={theme.breakpoints.md()}>

      H

    </_StyledThing5>;
};
const ObjectFnSimpleInterpolationInKey = (p)=>{
    const foo = '@media screen and (max-width: 600px)';
    return <_StyledThing6 $_css19={foo}>

      H

    </_StyledThing6>;
};
const ObjectPropWithSpread = ()=>{
    const css = {
        color: 'red'
    };
    const playing = true;
    return <_StyledDiv $_css20={css} $_css21={playing ? {
        opacity: 0,
        bottom: '-100px'
    } : {}}/>;
};
var _StyledSomeComponent = styled(SomeComponent).withConfig({
    displayName: "code___StyledSomeComponent",
    componentId: "sc-867225be-8"
})`color: red;`;
var _StyledSomeOtherComponent = styled(SomeOtherComponent).withConfig({
    displayName: "code___StyledSomeOtherComponent",
    componentId: "sc-867225be-9"
})`color: red;`;
var _StyledThing2 = styled(Thing4).withConfig({
    displayName: "code___StyledThing2",
    componentId: "sc-867225be-10"
})`color: red;`;
var _StyledP = styled("p").withConfig({
    displayName: "code___StyledP",
    componentId: "sc-867225be-11"
})`flex: 1;`;
var _StyledP2 = styled("p").withConfig({
    displayName: "code___StyledP2",
    componentId: "sc-867225be-12"
})`
      flex: 1;
    `;
var _StyledP3 = styled("p").withConfig({
    displayName: "code___StyledP3",
    componentId: "sc-867225be-13"
})({
    color: 'blue'
});
var _StyledP4 = styled("p").withConfig({
    displayName: "code___StyledP4",
    componentId: "sc-867225be-14"
})`flex: 1;`;
var _StyledP5 = styled("p").withConfig({
    displayName: "code___StyledP5",
    componentId: "sc-867225be-15"
})`
      color: blue;
    `;
var _StyledParagraph = styled(Paragraph).withConfig({
    displayName: "code___StyledParagraph",
    componentId: "sc-867225be-16"
})`flex: 1`;
var _StyledP6 = styled("p").withConfig({
    displayName: "code___StyledP6",
    componentId: "sc-867225be-17"
})`${(p)=>p.$_css}`;
var _StyledP7 = styled("p").withConfig({
    displayName: "code___StyledP7",
    componentId: "sc-867225be-18"
})`
      background: ${(p)=>p.$_css2};
    `;
var _StyledP8 = styled("p").withConfig({
    displayName: "code___StyledP8",
    componentId: "sc-867225be-19"
})`
      color: ${(props1)=>props1.theme.a};
    `;
var _StyledP9 = styled("p").withConfig({
    displayName: "code___StyledP9",
    componentId: "sc-867225be-20"
})`
      border-radius: ${radius}px;
    `;
var _StyledP10 = styled("p").withConfig({
    displayName: "code___StyledP10",
    componentId: "sc-867225be-21"
})`
      color: ${(p)=>p.$_css3};
    `;
var _StyledP11 = styled("p").withConfig({
    displayName: "code___StyledP11",
    componentId: "sc-867225be-22"
})`
      color: ${(props1)=>props1.theme.color};
    `;
var _StyledButtonGhost = styled(Button.Ghost).withConfig({
    displayName: "code___StyledButtonGhost",
    componentId: "sc-867225be-23"
})`flex: 1`;
var _StyledButtonGhostNew = styled(Button.Ghost.New).withConfig({
    displayName: "code___StyledButtonGhostNew",
    componentId: "sc-867225be-24"
})`flex: 1`;
var _StyledButtonGhost2 = styled(button.ghost).withConfig({
    displayName: "code___StyledButtonGhost2",
    componentId: "sc-867225be-25"
})`flex: 1`;
var _StyledButtonGhost3 = styled("button-ghost").withConfig({
    displayName: "code___StyledButtonGhost3",
    componentId: "sc-867225be-26"
})`flex: 1`;
var _StyledP12 = styled("p").withConfig({
    displayName: "code___StyledP12",
    componentId: "sc-867225be-27"
})((p)=>({
        background: p.$_css4,
        color: p.$_css5,
        textAlign: 'left',
        '::before': {
            content: p.$_css6
        },
        '::after': {
            content: p.$_css7
        }
    }));
var _StyledP13 = styled("p").withConfig({
    displayName: "code___StyledP13",
    componentId: "sc-867225be-28"
})((p)=>({
        ...{
            '::before': {
                content: p.$_css8
            },
            '::after': {
                content: p.$_css9
            },
            ...{
                '::before': {
                    content: p.$_css10
                },
                '::after': {
                    content: p.$_css11
                }
            }
        },
        background: p.$_css12,
        textAlign: 'left',
        '::before': {
            content: p.$_css13
        },
        '::after': {
            content: p.$_css14
        }
    }));
var _StyledP14 = styled("p").withConfig({
    displayName: "code___StyledP14",
    componentId: "sc-867225be-29"
})((p)=>({
        color: p.$_css15
    }));
var _StyledDiv = styled("div").withConfig({
    displayName: "code___StyledDiv",
    componentId: "sc-867225be-30"
})((p)=>({
        ...p.$_css20,
        ...p.$_css21
    }));
