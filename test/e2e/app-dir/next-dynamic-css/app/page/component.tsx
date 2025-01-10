import './global.css'
import base from './base.module.css'
import styles from './component.module.css'

export default function Component() {
  return (
    <p id="component" className={`global-class ${base.class} ${styles.class}`}>
      Hello Component
    </p>
  )
}
