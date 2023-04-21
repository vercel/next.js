import React, { ElementType, Fragment, Ref } from 'react';
import { Video } from './Video';
import { Image } from './Image';
import { StaticImageData } from 'next/image';
import { Media as MediaType } from '../../payload-types';

export type Props = {
  src?: StaticImageData // for static media
  alt?: string
  resource?: MediaType // for Payload media
  size?: string // for NextImage only
  priority?: boolean // for NextImage only
  fill?: boolean // for NextImage only
  className?: string
  imgClassName?: string
  videoClassName?: string
  htmlElement?: ElementType | null
  onClick?: () => void
  onLoad?: () => void
  ref?: Ref<(null | HTMLImageElement | HTMLVideoElement)>
}

export const Media: React.FC<Props> = (props) => {
  const {
    className,
    resource,
    htmlElement = 'div'
  } = props;

  const isVideo = typeof resource !== 'string' && resource?.mimeType?.includes('video');
  const Tag = htmlElement as ElementType || Fragment;

  return (
    <Tag
      {...htmlElement !== null ? {
        className
      } : {}}
    >
      {isVideo ? (
        <Video {...props} />
      ) : (
        <Image {...props} /> // eslint-disable-line
      )}
    </Tag>
  )
};
