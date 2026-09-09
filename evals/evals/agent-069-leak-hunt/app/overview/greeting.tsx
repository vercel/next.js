import { getCurrentUser } from '@/lib/request-context'

// Trailing card under the usage numbers. The activity rollup batches audit
// events in 50ms windows before the summary line is produced.
export async function Greeting() {
  await new Promise((resolve) => setTimeout(resolve, 50))
  const user = getCurrentUser()
  return (
    <p data-testid="greeting">
      Signed in as {user.userId} ({user.company})
    </p>
  )
}
