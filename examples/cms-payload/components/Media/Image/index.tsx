import React from 'react';
import NextImage, { StaticImageData } from 'next/image';
import classes from './index.module.scss'
import cssVariables from '../../../cssVariables';
import { Props } from '..';

const { breakpoints } = cssVariables;

export const Image: React.FC<Props> = (props) => {
  const {
    imgClassName,
    onClick,
    onLoad: onLoadFromProps,
    size,
    resource,
    priority,
    fill,
    src: srcFromProps,
    alt: altFromProps
  } = props;

  const [isLoading, setIsLoading] = React.useState(true);

  let width: number | undefined;
  let height: number | undefined;
  let alt = altFromProps;
  let src: StaticImageData | string = srcFromProps || '';

  if (!src && resource && typeof resource !== 'string') {
    const {
      width: fullWidth,
      height: fullHeight,
      filename: fullFilename,
      alt: altFromResource,
    } = resource;

    width = fullWidth;
    height = fullHeight;
    alt = altFromResource;

    let filename = fullFilename;

    src = `${process.env.NEXT_PUBLIC_S3_ENDPOINT}/${process.env.NEXT_PUBLIC_S3_BUCKET}/${filename}`;
  }

  // NOTE: this is used by the browser to determine which image to download at different screen sizes
  const sizes = Object.entries(breakpoints).map(([, value]) => `(max-width: ${value}px) ${value}px`).join(', ');

  return (
    <NextImage
      className={[
        isLoading && classes.placeholder,
        classes.image,
        imgClassName
      ].filter(Boolean).join(' ')}
      src={src}
      alt={alt || ''}
      onClick={onClick}
      onLoad={() => {
        setIsLoading(false)
        if (typeof onLoadFromProps === 'function') {
          onLoadFromProps();
        }
      }}
      fill={fill}
      width={!fill ? width : undefined}
      height={!fill ? height : undefined}
      sizes={sizes}
      priority={priority}
    />
  );
}
