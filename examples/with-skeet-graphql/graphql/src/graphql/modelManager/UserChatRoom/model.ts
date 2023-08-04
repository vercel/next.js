import { objectType } from 'nexus'
import { UserChatRoom } from 'nexus-prisma'

export const UserChatRoomObject = objectType({
  name: UserChatRoom.$name,
  description: UserChatRoom.$description,
  definition(t) {
    t.relayGlobalId('id', {})
    t.field(UserChatRoom.userId)
    t.field(UserChatRoom.chatRoomId)
    t.field(UserChatRoom.createdAt)
    t.field(UserChatRoom.updatedAt)
  },
})