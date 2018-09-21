import Link from 'next/link'

export default () => (
  <div>
    <Link href='/'>
      <a style={styles.a} >Home</a>
    </Link>

    <Link href='/calendar'>
      <a style={styles.a} >Calendar</a>
    </Link>

      <Link href='/card'>
          <a style={styles.a} >Card</a>
      </Link>

  </div>
)

const styles = {
  a: {
    marginRight: 10
  }
}
