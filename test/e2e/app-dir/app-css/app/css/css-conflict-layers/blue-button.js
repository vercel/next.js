import { Button } from './button'
import styles from './blue-button.module.css'

export function BlueButton() {
  return <Button className={'btn-blue ' + styles['blue-button']}>Button</Button>
}
