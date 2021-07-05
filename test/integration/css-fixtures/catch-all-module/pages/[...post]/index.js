import styles1 from './index.module.css'
import styles2 from './55css.module.css'

const Index = () => (
  <div className={styles1.home + ' ' + styles2.home} id="my-div">
    hello world
  </div>
)

export default Index
