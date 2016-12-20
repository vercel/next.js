import Link from 'next/link'

export default () => (
  <div>
    <Link href='/'>
      <a style={styles.a} >Home</a>
    </Link>

    <Link href='/about'>
      <a style={styles.a} >About</a>
    </Link>
  </div>
)

const styles = {
  a: {
    marginRight: 10
  }
}
