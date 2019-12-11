import helloStyles from './hello.module.css'

export function hello(): string {
  console.log(helloStyles.hello)
  return 'Hello'
}
