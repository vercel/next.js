// Avoid static shell validation -- we only want to test the validation of `prefetch: 'runtime'` here.
export const unstable_instant = false

export default function DisableStaticShell({ children }) {
  return <>{children}</>
}
