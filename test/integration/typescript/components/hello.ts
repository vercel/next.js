import * as helloStyles from './hello.module.css'
import * as helloStyles2 from './hello.module.scss'
import * as helloStyles3 from './hello.module.sass'

export function hello(): string {
  console.log(helloStyles.hello)
  console.log(helloStyles2.hello)
  console.log(helloStyles3.hello)
  return 'Hello'
}
