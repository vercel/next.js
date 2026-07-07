// Avoid static shell validation -- we only want to test the validation of `prefetch: 'runtime'` here.
export const instant = false
export const prefetch = 'allow-runtime'

export default function DisableStaticShell({ children }) {
  return <>{children}</>
}
