import { headerBanner, headerTitle } from '../styles/header'

export default function Header(props) {
  return (
    <>
      <h1 className={headerTitle.className}>Guestbook</h1>
      {headerBanner.styles}
      {headerTitle.styles}
    </>
  )
}
