// Without CSS Modules
import '../style.less'
export default () => <div className="example">Hello Less!</div>

// With CSS Modules
/*
import style from '../style.less'
export default () => <div className={style.example}>Hello Less!</div>
*/
