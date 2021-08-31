import { SignIn } from '@clerk/nextjs'

const SignInPage = () => (
  <SignIn path="/sign-in" routing="path" signUpURL="/sign-up" />
)

export default SignInPage
