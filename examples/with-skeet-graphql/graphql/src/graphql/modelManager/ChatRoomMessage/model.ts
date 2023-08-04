import { objectType } from 'nexus'
import { ChatRoomMessage } from 'nexus-prisma'

export const ChatRoomMessageObject = objectType({
  name: ChatRoomMessage.$name,
  description: ChatRoomMessage.$description,
  definition(t) {
    t.relayGlobalId('id', {})
    t.field(ChatRoomMessage.role)
    t.field(ChatRoomMessage.content)
    t.relayGlobalId('userId', {})
    t.relayGlobalId('chatRoomId', {})
    t.field(ChatRoomMessage.createdAt)
    t.field(ChatRoomMessage.updatedAt)
  },
})
