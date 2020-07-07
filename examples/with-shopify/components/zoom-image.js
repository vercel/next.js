import { useState } from 'react'

export default function ZoomImage({ src, children }) {
  const [position, setPosition] = useState({
    backgroundPosition: '0% 0%',
  })
  const handleMouseMove = (e) => {
    const { left, top, width, height } = e.target.getBoundingClientRect()
    const x = ((e.pageX - left) / width) * 100
    const y = ((e.pageY - top) / height) * 100

    setPosition(`${x}% ${y}%`)
  }

  return (
    <figure
      className="w-full bg-no-repeat"
      style={{
        backgroundImage: `url(${src})`,
        backgroundPosition: position,
      }}
      onMouseMove={handleMouseMove}
    >
      {children}
    </figure>
  )
}
