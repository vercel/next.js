import { RefreshButton } from '../../../components/RefreshButton'

export default function Page() {
  return (
    <>
      <span>Login Page</span>
      <RefreshButton />
      Random Number: <span id="login-page-random">{Math.random()}</span>
    </>
  )
}
