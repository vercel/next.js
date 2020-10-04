// Without CSS Modules
import '../style.less'
export default function Home() {
  return <div className="example">Hello Less!</div>
}

// With CSS Modules
/*
import style from '../style.less'
export default function Home() {
  return <div className={style.example}>Hello Less!</div>
}
*/
