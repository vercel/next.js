import helloStyles from './hello.module.css'
import helloStyles2 from './hello.module.scss'
import helloStyles3 from './hello.module.sass'

export function hello(): string {
  console.log(helloStyles.hello)
  console.log(helloStyles2.hello)
  console.log(helloStyles3.hello)
  return 'Hello'
}
