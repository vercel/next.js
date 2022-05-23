import styles, { foo as styles3 } from './styles'

const styles2 = require('./styles2')

export default () =>
  <div>
    <p>test</p>
    <div>woot</div>
    <p>woot</p>
    <style jsx global>
      {styles2}
    </style>
    <style jsx global>
      {styles3}
    </style>
    <style jsx global>
      {styles}
    </style>
  </div>
