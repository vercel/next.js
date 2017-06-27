import ActiveLink from './ActiveLink'

// typically you want to use `next/link` for this usecase
// but ActiveLink shows how you can also access the router
// and use it manually

export default () => (
  <div>
    <ActiveLink href='/'>Home</ActiveLink>
    <ActiveLink href='/about'>About</ActiveLink>
    <ActiveLink href='/error'>Error</ActiveLink>
  </div>
)
