import { objectType } from 'nexus'
import { User } from 'nexus-prisma'
import { roleEnum } from '../enums'

export const UserObject = objectType({
  name: User.$name,
  description: User.$description,
  definition(t) {
    t.relayGlobalId('id', {})
    t.field(User.uid)
    t.field(User.username)
    t.field(User.email)
    t.field(User.iconUrl)
    t.field(User.role.name, { type: roleEnum })
    t.field(User.iv)
    t.field(User.createdAt)
    t.field(User.updatedAt)
  },
})
