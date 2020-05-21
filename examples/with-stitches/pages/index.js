import { useCss } from '../css'

export default function Home() {
  const css = useCss()
  return <h1 className={css.color('RED')}>Hello world</h1>
}
