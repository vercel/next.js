import _styled from "styled-components";
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
 */ const StaticString = (p)=><_StyledP >A</_StyledP>
;
const StaticTemplate = (p)=><_StyledP2 >

    A

  </_StyledP2>
;
const ObjectProp = (p)=><_StyledP3 >A</_StyledP3>
;
const NoChildren = (p)=><_StyledP4 />
;
const CssHelperProp = (p)=><_StyledP5 >

    A

  </_StyledP5>
;
/*
 * Dynamic prop
 */ const CustomComp = (p)=><_StyledParagraph >H</_StyledParagraph>
;
const DynamicProp = (p)=><_StyledP6 $_css={props.cssText}>H</_StyledP6>
;
const LocalInterpolation = (p)=><_StyledP7 $_css2={props.bg}>

    H

  </_StyledP7>
;
const FuncInterpolation = (p)=><_StyledP8 >

    H

  </_StyledP8>
;
const radius = 10;
const GlobalInterpolation = (p)=><_StyledP9 >

    H

  </_StyledP9>
;
const LocalCssHelperProp = (p)=><_StyledP10 $_css3={p.color}>

    A

  </_StyledP10>
;
const DynamicCssHelperProp = (p)=><_StyledP11 >

    A

  </_StyledP11>
;
const CustomCompWithDot = (p)=><_StyledButtonGhost >H</_StyledButtonGhost>
;
const NestedCompWithDot = (p)=><_StyledButtonGhostNew >H</_StyledButtonGhostNew>
;
const CustomCompWithDotLowerCase = (p)=><_StyledButtonGhost2 >H</_StyledButtonGhost2>
;
const CustomElement = (p)=><_StyledButtonGhost3 >H</_StyledButtonGhost3>
;
const globalVar = '"foo"';
const getAfterValue = ()=>'"bar"'
;
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
/* styled component defined after function it's used in */ const EarlyUsageComponent = (p)=><_StyledThing />
;
const Thing3 = styled.div.withConfig({
    displayName: "code__Thing3",
    componentId: "sc-867225be-2"
})`
  color: blue;
`;
var _StyledThing6 = _styled(Thing3)((p)=>({
        [p.$_css19]: {
            color: 'red'
        }
    })
);
var _StyledThing5 = _styled(Thing3)((p)=>({
        [p.$_css18]: {
            color: 'red'
        }
    })
);
var _StyledThing4 = _styled(Thing3)((p)=>({
        [p.$_css17]: {
            color: 'red'
        }
    })
);
var _StyledThing3 = _styled(Thing3)((p)=>({
        color: p.$_css16
    })
);
var _StyledThing = _styled(Thing3)`color: red;`;
const EarlyUsageComponent2 = (p)=><_StyledThing2 />
;
function Thing4(props) {
    return <div {...props}/>;
}
/* insert before usage for non-local scope styled HOC targets */ const ImportedComponentUsage = (p)=><_StyledSomeComponent />
;
const RequiredComponentUsage = (p)=><_StyledSomeOtherComponent />
;
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
var _StyledSomeComponent = _styled(SomeComponent)`color: red;`;
var _StyledSomeOtherComponent = _styled(SomeOtherComponent)`color: red;`;
var _StyledThing2 = _styled(Thing4)`color: red;`;
var _StyledP = _styled("p")`flex: 1;`;
var _StyledP2 = _styled("p")`
      flex: 1;
    `;
var _StyledP3 = _styled("p")({
    color: 'blue'
});
var _StyledP4 = _styled("p")`flex: 1;`;
var _StyledP5 = _styled("p")`
      color: blue;
    `;
var _StyledParagraph = _styled(Paragraph)`flex: 1`;
var _StyledP6 = _styled("p")`${(p)=>p.$_css
}`;
var _StyledP7 = _styled("p")`
      background: ${(p)=>p.$_css2
};
    `;
var _StyledP8 = _styled("p")`
      color: ${(props)=>props.theme.a
};
    `;
var _StyledP9 = _styled("p")`
      border-radius: ${radius}px;
    `;
var _StyledP10 = _styled("p")`
      color: ${(p)=>p.$_css3
};
    `;
var _StyledP11 = _styled("p")`
      color: ${(props)=>props.theme.color
};
    `;
var _StyledButtonGhost = _styled(Button.Ghost)`flex: 1`;
var _StyledButtonGhostNew = _styled(Button.Ghost.New)`flex: 1`;
var _StyledButtonGhost2 = _styled(button.ghost)`flex: 1`;
var _StyledButtonGhost3 = _styled("button-ghost")`flex: 1`;
var _StyledP12 = _styled("p")((p)=>({
        background: p.$_css4,
        color: p.$_css5,
        textAlign: 'left',
        '::before': {
            content: p.$_css6
        },
        '::after': {
            content: p.$_css7
        }
    })
);
var _StyledP13 = _styled("p")((p)=>({
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
    })
);
var _StyledP14 = _styled("p")((p)=>({
        color: p.$_css15
    })
);
var _StyledDiv = _styled("div")((p)=>({
        ...p.$_css20,
        ...p.$_css21
    })
);
