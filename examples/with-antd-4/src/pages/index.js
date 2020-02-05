import { Button } from 'antd'

import * as styles from './index.module.css'

const Index = () => (
  <div>
    <p>
      Basic primary button
      <br />
      <Button type="primary">Button</Button>
    </p>
    <p>
      Modified primary button
      <br />
      <Button type="primary" className={styles.specialStyle}>
        Button
      </Button>
    </p>
  </div>
)

export default Index
