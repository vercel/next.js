import ipaddr from 'next/dist/compiled/ipaddr.js'

export function isPrivateIp(ip: string): boolean {
  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1)
  }
  if (!ipaddr.isValid(ip)) {
    return false
  }
  try {
    const addr = ipaddr.parse(ip)
    const kind = addr.range()
    return kind !== 'unicast'
  } catch (e) {
    return false
  }
}
