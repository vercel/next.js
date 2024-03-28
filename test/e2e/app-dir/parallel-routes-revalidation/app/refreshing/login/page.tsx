import { Button } from '../buttonRefresh'

export default function Page() {
  return (
    <>
      <span>Login Page</span>
      <Button />
      Random Number: <span id="login-page-random">{Math.random()}</span>
    </>
  )
}
