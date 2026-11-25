'use client'
import { describeUtils } from './vendor-util'
export default function Avatar({ name, hue, size = 24 }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <span
      className="avatar"
      title={name}
      style={{
        width: size,
        height: size,
        background: `hsl(${hue} 65% 45%)`,
        fontSize: size * 0.42,
      }}
    >
      {initials}
    </span>
  )
}

export const __layers = [describeUtils].length
