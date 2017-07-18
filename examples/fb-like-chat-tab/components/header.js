import Link from 'next/link'

const Header = (props) => {
  return (
    <div>
      <Link href='/' prefetch>
        <a> Home </a>
      </Link>
      <Link href='/about' prefetch>
        <a> About </a>
      </Link>
      <Link href='/contact' prefetch>
        <a> Contact </a>
      </Link>
    </div>
  )
}

export default Header
