import React from 'react'
import cn from "classnames";
import DotCmsImage from "../../../../dotcms-image";


export const DotImage = ({ attrs: { textAlign, data } }) => {
  const { asset, title } = data
  const [imgTitle] = title.split('.')

  return (
    <div className="w-full h-64 mb-4 relative" style={{ textAlign: textAlign }}>

      <DotCmsImage
        alt={`Cover Image for ${title}`}
        className={cn('shadow-small', {
          'hover:shadow-medium transition-shadow  duration-200': imgTitle,
        })}
        src={asset}
        layout="fill"
      />

    </div>
  )
}

export default DotImage
