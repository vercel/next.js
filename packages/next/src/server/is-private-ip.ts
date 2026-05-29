import ipaddr from 'next/dist/compiled/ipaddr.js'

export function isPrivateIp(ip: string): boolean {
  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1)
  }
  if (!ipaddr.isValid(ip)) {
    return false
  }
  try {
    let addr = ipaddr.parse(ip)
    if (addr.kind() === 'ipv6' && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
      addr = (addr as ipaddr.IPv6).toIPv4Address()
    }
    const range = addr.range()
    return range !== 'unicast'
  } catch (e) {
    return false
  }
}
