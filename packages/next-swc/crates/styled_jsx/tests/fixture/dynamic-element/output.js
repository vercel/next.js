import _JSXStyle from "next/dist/shared/lib/styled-jsx";
export default (({ level =1  })=>{
    const Element = `h${level}`;
    return <Element className={"jsx-fca64cc3f069b519" + " " + "root"}>

      <p className={"jsx-fca64cc3f069b519"}>dynamic element</p>

      <_JSXStyle id={"fca64cc3f069b519"}>{".root.jsx-fca64cc3f069b519{background:red}"}</_JSXStyle>

    </Element>;
});
export const TestLowerCase = ({ level =1  })=>{
    const element = `h${level}`;
    return <element className={"jsx-fca64cc3f069b519" + " " + "root"}>

      <p className={"jsx-fca64cc3f069b519"}>dynamic element</p>

      <_JSXStyle id={"fca64cc3f069b519"}>{".root.jsx-fca64cc3f069b519{background:red}"}</_JSXStyle>

    </element>;
};
const Element2 = 'div';
export const Test2 = ()=>{
    return <Element2 className="root">

      <p className={"jsx-fca64cc3f069b519"}>dynamic element</p>

      <_JSXStyle id={"fca64cc3f069b519"}>{".root.jsx-fca64cc3f069b519{background:red}"}</_JSXStyle>

    </Element2>;
};
export const Test3 = ({ Component ='div'  })=>{
    return <Component className={"jsx-f825b24bbab5b83b"}>

      <p className={"jsx-f825b24bbab5b83b"}>dynamic element</p>

        <_JSXStyle id={"f825b24bbab5b83b"}>{".root.jsx-f825b24bbab5b83b{background:red}"}</_JSXStyle>

    </Component>;
};
