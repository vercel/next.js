import _JSXStyle from "next/dist/shared/lib/styled-jsx";
import styles from './styles2';
export default (({ level =1  })=>{
    const Element = `h${level}`;
    return <Element className={`jsx-${styles.__hash}` + " " + "root"}>

      <p className={`jsx-${styles.__hash}`}>dynamic element</p>

      <_JSXStyle id={styles.__hash}>{styles}</_JSXStyle>

    </Element>;
});
