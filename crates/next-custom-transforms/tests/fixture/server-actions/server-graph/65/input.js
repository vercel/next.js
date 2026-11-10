'use cache'

// @ts-ignore
import { wrapItLikeItsHot } from './wrap-it-like-its-hot'
// @ts-ignore
import { ClientComponent } from './client-component'

export default wrapItLikeItsHot(({ hot }) => {
  return (
    <ClientComponent
      action={async () => {
        'use server'
        console.log('hot action')
      }}
    >
      {hot}
    </ClientComponent>
  )
})
