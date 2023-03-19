import React from 'react'
import Loader from '../Loader'
import styles from './Status.module.css'

interface IStatusProps {
  done: boolean
  title: string
}
const Status: React.FC<IStatusProps> = ({ done, title }): JSX.Element => (
  <div className={styles.container}>
    <p>{title}</p>
    <Loader done={done} />
  </div>
)

export default Status
