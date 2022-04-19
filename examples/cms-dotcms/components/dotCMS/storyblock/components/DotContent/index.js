import React from 'react'

import Link from '../../../../link'
import { DotThumbnail } from './DotThumbnail'
import { DotState } from '../DotContent/DotState'

export const DotContent = ({
  attrs: { data },
}) => {

  const { contentType, title, urlMap } = data
  return (
    <div className="w-full h-full mb-4 box-border">
      <div className="bg-white border border-solid border-gray-300 flex">
        <div className="box-border p-2 w-28">
          <div className="flex h-full w-full justify-center items-center relative">
            <DotThumbnail {...data} />
          </div>
        </div>
        <div className="box-border flex flex-col flex-1 p-2 pr-4">
          <div className="flex-1">
            <div className="w-full overflow-hidden">
              <h3 className="overflow-hidden text-ellipsis whitespace-nowrap font-bold text-2xl mb-1 ">
                { urlMap ? (
                  <Link href={urlMap}>{title}</Link>
                ) : (
                  <span>{title} </span>
                    )}
              </h3>
            </div>
            <div className="text-sm text-gray-400 mb-4">
              <span>{contentType}</span>
            </div>
          </div>
          <div className="flex items-center">
            <DotState {...data} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default DotContent
