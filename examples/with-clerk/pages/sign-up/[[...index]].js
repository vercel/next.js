import { SignUp } from '@clerk/nextjs'

const SignUpPage = () => (
  <SignUp path="/sign-up" routing="path" signInURL="/sign-in" />
)

export default SignUpPage
