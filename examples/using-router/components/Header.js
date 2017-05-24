import CustomLink from './CustomLink'

// typically you want to use `next/link` for this usecase
// but CustomLink shows how you can also access the router
// and use it manually

export default () => (
  <div>
    <CustomLink href='/'>Home</CustomLink>
    <CustomLink href='/about'>About</CustomLink>
    <CustomLink href='/error'>Error</CustomLink>
  </div>
)
