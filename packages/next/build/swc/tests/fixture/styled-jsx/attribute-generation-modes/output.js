import _JSXStyle from "styled-jsx/style";
import styles from "./styles";
const styles2 = require("./styles2");
export const Test1 = ()=><div className={`jsx-${styles2.__hash} jsx-${styles.__hash}`}>
    <p className={`jsx-${styles2.__hash} jsx-${styles.__hash}`}>external only</p>
    <_JSXStyle id={styles.__hash}>{styles}</_JSXStyle>
    <_JSXStyle id={styles2.__hash}>{styles2}</_JSXStyle>
  </div>
;
export const Test2 = ()=><div className={"jsx-81a68341e430a972 " + `jsx-${styles.__hash}`}>
    <p className={"jsx-81a68341e430a972 " + `jsx-${styles.__hash}`}>external and static</p>
    <_JSXStyle id={"81a68341e430a972"}>{"p.jsx-81a68341e430a972 {color:red}"}</_JSXStyle>
    <_JSXStyle id={styles.__hash}>{styles}</_JSXStyle>
  </div>
;
export const Test3 = ({ color  })=><div className={`jsx-${styles.__hash}` + " " + _JSXStyle.dynamic([
        "26b457d3bc475235",
        [
            color
        ]
    ])}>
    <p className={`jsx-${styles.__hash}` + " " + _JSXStyle.dynamic([
        "26b457d3bc475235",
        [
            color
        ]
    ])}>external and dynamic</p>
    <_JSXStyle id={"26b457d3bc475235"} dynamic={[
        color
    ]}>{`p.__jsx-style-dynamic-selector {color:${color}}`}</_JSXStyle>
    <_JSXStyle id={styles.__hash}>{styles}</_JSXStyle>
  </div>
;
export const Test4 = ({ color  })=><div className={`jsx-${styles.__hash}` + " jsx-ceba8c9ce34e3d0c " + _JSXStyle.dynamic([
        "e6cca97eb9ca1a15",
        [
            color
        ]
    ])}>
    <p className={`jsx-${styles.__hash}` + " jsx-ceba8c9ce34e3d0c " + _JSXStyle.dynamic([
        "e6cca97eb9ca1a15",
        [
            color
        ]
    ])}>external, static and dynamic</p>
    <_JSXStyle id={"ceba8c9ce34e3d0c"}>{"p.jsx-ceba8c9ce34e3d0c {display:inline-block}"}</_JSXStyle>
    <_JSXStyle id={"c86b0d7e7328204f"} dynamic={[
        color
    ]}>{`p.__jsx-style-dynamic-selector {color:${color}}`}</_JSXStyle>
    <_JSXStyle id={styles.__hash}>{styles}</_JSXStyle>
  </div>
;
export const Test5 = ()=><div className={"jsx-df0159ebd3f9fb6f"}>
    <p className={"jsx-df0159ebd3f9fb6f"}>static only</p>
    <_JSXStyle id={"ceba8c9ce34e3d0c"}>{"p.jsx-df0159ebd3f9fb6f {display:inline-block}"}</_JSXStyle>
    <_JSXStyle id={"81a68341e430a972"}>{"p.jsx-df0159ebd3f9fb6f {color:red}"}</_JSXStyle>
  </div>
;
export const Test6 = ({ color  })=><div className={"jsx-ceba8c9ce34e3d0c " + _JSXStyle.dynamic([
        "a55f0611581d64ca",
        [
            color
        ]
    ])}>
    <p className={"jsx-ceba8c9ce34e3d0c " + _JSXStyle.dynamic([
        "a55f0611581d64ca",
        [
            color
        ]
    ])}>static and dynamic</p>
    <_JSXStyle id={"ceba8c9ce34e3d0c"}>{"p.jsx-ceba8c9ce34e3d0c {display:inline-block}"}</_JSXStyle>
    <_JSXStyle id={"f0677f918e6b5a01"} dynamic={[
        color
    ]}>{`p.__jsx-style-dynamic-selector {color:${color}}`}</_JSXStyle>
  </div>
;
export const Test7 = ({ color  })=><div className={_JSXStyle.dynamic([
        "4adc07771eb3723",
        [
            color
        ]
    ])}>
    <p className={_JSXStyle.dynamic([
        "4adc07771eb3723",
        [
            color
        ]
    ])}>dynamic only</p>
    <_JSXStyle id={"4adc07771eb3723"} dynamic={[
        color
    ]}>{`p.__jsx-style-dynamic-selector {color:${color}}`}</_JSXStyle>
  </div>
;
export const Test8 = ({ color  })=>{
    if (color) {
        const innerProps = {
            color
        };
        return <div className={_JSXStyle.dynamic([
            "a552a4a765a9ca4e",
            [
                innerProps.color
            ]
        ])}>
        <p className={_JSXStyle.dynamic([
            "a552a4a765a9ca4e",
            [
                innerProps.color
            ]
        ])}>dynamic with scoped compound variable</p>
        <_JSXStyle id={"a552a4a765a9ca4e"} dynamic={[
            innerProps.color
        ]}>{`p.__jsx-style-dynamic-selector {color:${innerProps.color}}`}</_JSXStyle>
      </div>;
    }
};
export const Test9 = ({ color  })=>{
    const innerProps = {
        color
    };
    return <div className={_JSXStyle.dynamic([
        "7ef39e3312c80ead",
        [
            innerProps.color
        ]
    ])}>
      <p className={_JSXStyle.dynamic([
        "7ef39e3312c80ead",
        [
            innerProps.color
        ]
    ])}>dynamic with compound variable</p>
      <_JSXStyle id={"7ef39e3312c80ead"} dynamic={[
        innerProps.color
    ]}>{`p.__jsx-style-dynamic-selector {color:${innerProps.color}}`}</_JSXStyle>
    </div>;
};
const foo = "red";
export const Test10 = ()=><div className={"jsx-688a08f9e73a5653"}>
    <p className={"jsx-688a08f9e73a5653"}>dynamic with constant variable</p>
    <_JSXStyle id={"688a08f9e73a5653"}>{`p.jsx-688a08f9e73a5653 {color:${foo}}`}</_JSXStyle>
  </div>
;
export const Test11 = ({ color  })=>{
    const items = Array.from({
        length: 5
    }).map((item, i)=><li key={i} className={_JSXStyle.dynamic([
            "ebe03db0369a2939",
            [
                color
            ]
        ]) + " " + "item"}>
      <_JSXStyle id={"ebe03db0369a2939"} dynamic={[
            color
        ]}>{`.item.__jsx-style-dynamic-selector {color:${color}}`}</_JSXStyle>
      Item #{i + 1}
    </li>
    );
    return <ul className="items">{items}</ul>;
};