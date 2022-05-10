import _JSXStyle from "next/dist/shared/lib/styled-jsx";
import styles from './styles';
export default (()=><div className={`jsx-${styles.__hash}`}>

    <p className={`jsx-${styles.__hash}`}>test</p>

    <_JSXStyle id={styles.__hash}>{styles}</_JSXStyle>

  </div>
);
