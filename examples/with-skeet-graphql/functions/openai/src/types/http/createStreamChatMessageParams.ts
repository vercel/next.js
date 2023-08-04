export type CreateStreamChatMessageParams = {
  chatRoomId: string
  content: string
}

export type GetChatRoomParams = {
  id: string
}

export type GetChatMessagesParams = {
  chatRoomId: string
}

export type CreateChatMessageParams = {
  role: string
  content: string
  chatRoomId: string
}

export type UpdateChatRoomTitleParams = {
  id: string
  title: string
}
