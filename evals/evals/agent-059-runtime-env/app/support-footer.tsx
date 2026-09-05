'use client'

export function SupportFooter() {
  return (
    <footer>
      <p>Need help? {process.env.NEXT_PUBLIC_SUPPORT_EMAIL}</p>
      <p>API endpoint: {process.env.NEXT_PUBLIC_API_BASE}</p>
    </footer>
  )
}
