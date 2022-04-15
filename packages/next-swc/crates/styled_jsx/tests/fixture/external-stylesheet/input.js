import styles from './styles'
const styles2 = require('./styles2')
import { foo as styles3 } from './styles'

export default () => (
  <div>
    <p className="foo">test</p>
    <p>woot</p>
    <style jsx global>
      {styles2}
    </style>
    <style jsx>{styles3}</style>
    <div>woot</div>
    <style jsx>{`
      p {
        color: red;
      }
      div {
        color: green;
      }
    `}</style>
    <style jsx>{styles}</style>
  </div>
)

export const Test = () => (
  <div>
    <p className="foo">test</p>
    <p>woot</p>
    <style jsx>{styles3}</style>
    <div>woot</div>
    <style jsx>{`
      p {
        color: red;
      }
      div {
        color: green;
      }
    `}</style>
  </div>
)
