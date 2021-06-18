import { SignIn } from '@clerk/clerk-react'

const SignInPage = () => (
  <SignIn path="/sign-in" routing="path" signUpURL="/sign-up" />
)

export default SignInPage
