// @ts-nocheck
/* eslint-disable */
const { cacheTag, cacheLife, revalidatePath } = require('next/cache')

export function MyComponent() {
  const tag = cacheTag('my-tag')
  const life = cacheLife('2 hours')

  // This should remain unchanged
  revalidatePath('/app')

  return (
    <div>
      <p>Using cache tag: {tag}</p>
      <p>Using cache life: {life}</p>
    </div>
  )
}