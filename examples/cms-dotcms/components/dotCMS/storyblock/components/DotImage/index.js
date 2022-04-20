import React from 'react'
import DotCMSImage from '../../../Image'


export const DotImage = ({ attrs: { textAlign, data } }) => {
  const { asset, title } = data
  const [imgTitle] = title.split('.')

  return (
    <div className="w-full h-64 mb-4 relative" style={{ textAlign: textAlign }}>
      <DotCMSImage objectFit={'cover'} path={asset} title={imgTitle} />
    </div>
  )
}

export default DotImage
