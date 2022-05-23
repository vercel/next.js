import _JSXStyle from "next/dist/shared/lib/styled-jsx";
import styles, { foo as styles3 } from './styles';
const styles2 = require('./styles2');
export default (()=><div >

    <p >test</p>

    <div >woot</div>

    <p >woot</p>

    <_JSXStyle id={styles2.__hash}>{styles2}</_JSXStyle>

    <_JSXStyle id={styles3.__hash}>{styles3}</_JSXStyle>

    <_JSXStyle id={styles.__hash}>{styles}</_JSXStyle>

  </div>
);
