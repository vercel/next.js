import { shortExpire } from '../cache'
export const ensureStatic = 'navigation'
export default function Page() {
  void shortExpire()
  return <p>Valid</p>
}
