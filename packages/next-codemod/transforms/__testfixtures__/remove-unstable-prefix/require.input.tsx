// @ts-nocheck
/* eslint-disable */
const { unstable_cacheTag, unstable_cacheLife, revalidatePath } = require('next/cache')

export function MyComponent() {
  const tag = unstable_cacheTag('my-tag')
  const life = unstable_cacheLife('2 hours')

  // This should remain unchanged
  revalidatePath('/app')

  return (
    <div>
      <p>Using cache tag: {tag}</p>
      <p>Using cache life: {life}</p>
    </div>
  )
}