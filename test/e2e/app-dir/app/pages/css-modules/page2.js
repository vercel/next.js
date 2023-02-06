import Link from 'next/link'
import classes from './page2.module.css'

export default function Page() {
  return (
    <>
      <h1 className={classes.box}>Page 2</h1>
      <Link href="/css-modules/page1">Page 1</Link>
    </>
  )
}
