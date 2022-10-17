import { Abel } from '@next/font/google'
const abel = Abel({ variant: '400', display: 'optional', preload: false })

export default function NoPreload() {
  return <p className={abel.className}>Hello world</p>
}
