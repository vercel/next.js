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
        "91fa0f3b39d3e0c",
        [
            color
        ]
    ])}>
    <p className={`jsx-${styles.__hash}` + " " + _JSXStyle.dynamic([
        "91fa0f3b39d3e0c",
        [
            color
        ]
    ])}>external and dynamic</p>
    <_JSXStyle id={"91fa0f3b39d3e0c"} dynamic={[
        color
    ]}>{`p.__jsx-style-dynamic-selector {color:${color}}`}</_JSXStyle>
    <_JSXStyle id={styles.__hash}>{styles}</_JSXStyle>
  </div>
;
export const Test4 = ({ color  })=><div className={`jsx-${styles.__hash}` + " jsx-ceba8c9ce34e3d0c " + _JSXStyle.dynamic([
        "9226ac99f7783f92",
        [
            color
        ]
    ])}>
    <p className={`jsx-${styles.__hash}` + " jsx-ceba8c9ce34e3d0c " + _JSXStyle.dynamic([
        "9226ac99f7783f92",
        [
            color
        ]
    ])}>external, static and dynamic</p>
    <_JSXStyle id={"ceba8c9ce34e3d0c"}>{"p.jsx-ceba8c9ce34e3d0c {display:inline-block}"}</_JSXStyle>
    <_JSXStyle id={"9af316d52d1c423f"} dynamic={[
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
        "4e1f4f799c4952d9",
        [
            color
        ]
    ])}>
    <p className={"jsx-ceba8c9ce34e3d0c " + _JSXStyle.dynamic([
        "4e1f4f799c4952d9",
        [
            color
        ]
    ])}>static and dynamic</p>
    <_JSXStyle id={"ceba8c9ce34e3d0c"}>{"p.jsx-ceba8c9ce34e3d0c {display:inline-block}"}</_JSXStyle>
    <_JSXStyle id={"2eb1cf35d257bb00"} dynamic={[
        color
    ]}>{`p.__jsx-style-dynamic-selector {color:${color}}`}</_JSXStyle>
  </div>
;
export const Test7 = ({ color  })=><div className={_JSXStyle.dynamic([
        "f35fdb942a460325",
        [
            color
        ]
    ])}>
    <p className={_JSXStyle.dynamic([
        "f35fdb942a460325",
        [
            color
        ]
    ])}>dynamic only</p>
    <_JSXStyle id={"f35fdb942a460325"} dynamic={[
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
            "30706f9f8c1428e4",
            [
                innerProps.color
            ]
        ])}>
        <p className={_JSXStyle.dynamic([
            "30706f9f8c1428e4",
            [
                innerProps.color
            ]
        ])}>dynamic with scoped compound variable</p>
        <_JSXStyle id={"30706f9f8c1428e4"} dynamic={[
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
        "18db7aec491386a4",
        [
            innerProps.color
        ]
    ])}>
      <p className={_JSXStyle.dynamic([
        "18db7aec491386a4",
        [
            innerProps.color
        ]
    ])}>dynamic with compound variable</p>
      <_JSXStyle id={"18db7aec491386a4"} dynamic={[
        innerProps.color
    ]}>{`p.__jsx-style-dynamic-selector {color:${innerProps.color}}`}</_JSXStyle>
    </div>;
};
const foo = "red";
export const Test10 = ()=><div className={"jsx-b3be59f3fc1baa3e"}>
    <p className={"jsx-b3be59f3fc1baa3e"}>dynamic with constant variable</p>
    <_JSXStyle id={"b3be59f3fc1baa3e"}>{`p.jsx-b3be59f3fc1baa3e {color:${foo}}`}</_JSXStyle>
  </div>
;
export const Test11 = ({ color  })=>{
    const items = Array.from({
        length: 5
    }).map((item, i)=><li key={i} className={_JSXStyle.dynamic([
            "4503e9a64c3e90f0",
            [
                color
            ]
        ]) + " " + "item"}>
      <_JSXStyle id={"4503e9a64c3e90f0"} dynamic={[
            color
        ]}>{`.item.__jsx-style-dynamic-selector {color:${color}}`}</_JSXStyle>
      Item #{i + 1}
    </li>
    );
    return <ul className="items">{items}</ul>;
};