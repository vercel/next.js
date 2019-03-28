import React from 'react'

const Image = ({ url, alt }) => (
  <img draggable={false} style={{ width: '100%', height: '100%', position: 'relative' }} src={url} alt={alt} />
)

export default Image
