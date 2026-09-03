import React from 'react';

export interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  blurWidth?: number;
  blurHeight?: number;
  [key: string]: any;
}

export const Image: React.FC<ImageProps> = ({
  src,
  alt,
  width,
  height,
  blurWidth,
  blurHeight,
  ...props
}) => {
  // Filter out blurWidth and blurHeight before passing to img element
  const { blurWidth: _, blurHeight: __, ...filteredProps } = props;

  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      {...filteredProps}
    />
  );
};

export default Image;