import { lang } from 'next/root-params'

export default function middleware() {
  console.log(lang)
}
