import { NavigateToOther } from './navigate-to-other'
export default function Layout({ children }) {
  return (
    <>
      <NavigateToOther />
      <hr />
      {children}
    </>
  )
}
