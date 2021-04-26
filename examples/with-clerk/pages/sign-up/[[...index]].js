import { SignUp } from '@clerk/clerk-react'

const SignUpPage = () => (
  <SignUp path="/sign-up" routing="path" signInURL="/sign-in" />
)

export default SignUpPage
