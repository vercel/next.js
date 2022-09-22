import CustomLink from './CustomLink'

export default function Header() {
  return (
    <header>
      <nav>
        <CustomLink href="/">Home</CustomLink>{' '}
        <CustomLink href="/about" prefetch>
          About
        </CustomLink>
      </nav>
    </header>
  )
}
