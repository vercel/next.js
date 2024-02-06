import { respond } from 'compat-next-server-module'

export async function middleware(request) {
  return await respond()
}
