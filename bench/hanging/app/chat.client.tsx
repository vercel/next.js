import { ChannelSubscription } from '@/app/websockets/channel-subscription'
import { send } from '@/app/websockets/rx-socket'

export function ChatClient() {
  new ChannelSubscription().send()
  send()

  return <div>ChatClient</div>
}
