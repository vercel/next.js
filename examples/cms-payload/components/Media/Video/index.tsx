import React, { useEffect, useRef, useState } from 'react';
import classes from './index.module.scss'
import { Media, Props } from '..';

export const Video: React.FC<Props> = (props) => {
  const {
    videoClassName,
    resource,
    onClick,
  } = props;

  const videoRef = useRef<HTMLVideoElement>(null);
  const [showFallback] = useState<boolean>();

  useEffect(() => {
    const { current: video } = videoRef;
    if (video) {
      video.addEventListener('suspend', () => {
        // setShowFallback(true);
        // console.warn('Video was suspended, rendering fallback image.')
      });
    }
  }, []);

  if (resource && typeof resource !== 'string') {
    const {
      filename,
    } = resource

    return (
      <video
        playsInline
        autoPlay
        muted
        loop
        controls={false}
        className={[
          classes.video,
          videoClassName,
        ].filter(Boolean).join(' ')}
        onClick={onClick}
        ref={videoRef}
      >
        <source src={`${process.env.NEXT_PUBLIC_API_URL}/media/${filename}`} />
      </video>
    );
  };

  return null
}
