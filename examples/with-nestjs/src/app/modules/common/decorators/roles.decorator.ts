import { ReflectMetadata } from '@nestjs/common'

export const Roles = (...roles: string[]) => ReflectMetadata('roles', roles)
