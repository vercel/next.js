import { hello as helloClass } from './hello.module.css'

export function hello(): string {
  console.log(helloClass)
  return 'Hello'
}
