export default async function ResetPasswordPage(
  props: PageProps<'/reset-password/[token]'>
) {
  const { token } = await props.params

  return (
    <div>
      <h1>Reset Password</h1>
      <p>Enter your new password using token: {token}</p>
    </div>
  )
}
