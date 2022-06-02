import React, { useCallback, useState } from 'react'
import { useInView } from 'react-intersection-observer'

const imageAddStrategy = ({
  lazyLoad,
  isSsr,
  isIntersectionObserverAvailable,
  inView,
  loaded,
}) => {
  if (!lazyLoad) {
    return true
  }

  if (isSsr) {
    return false
  }

  if (isIntersectionObserverAvailable) {
    return inView || loaded
  }

  return true
}

const imageShowStrategy = ({
  lazyLoad,
  isSsr,
  isIntersectionObserverAvailable,
  loaded,
}) => {
  if (!lazyLoad) {
    return true
  }

  if (isSsr) {
    return false
  }

  if (isIntersectionObserverAvailable) {
    return loaded
  }

  return true
}

const Image = function ({
  className,
  fadeInDuration,
  intersectionTreshold,
  intersectionMargin,
  pictureClassName,
  lazyLoad = true,
  style,
  pictureStyle,
  explicitWidth,
  data,
}) {
  const [loaded, setLoaded] = useState(false)

  const handleLoad = useCallback(() => {
    setLoaded(true)
  }, [])

  const [ref, inView] = useInView({
    threshold: intersectionTreshold || 0,
    rootMargin: intersectionMargin || '0px 0px 0px 0px',
    triggerOnce: true,
  })

  const isSsr = typeof window === 'undefined'

  const isIntersectionObserverAvailable = isSsr
    ? false
    : !!window.IntersectionObserver

  const absolutePositioning = {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    right: 0,
  }

  const addImage = imageAddStrategy({
    lazyLoad,
    isSsr,
    isIntersectionObserverAvailable,
    inView,
    loaded,
  })
  const showImage = imageShowStrategy({
    lazyLoad,
    isSsr,
    isIntersectionObserverAvailable,
    inView,
    loaded,
  })

  const webpSource = data.webpSrcSet && (
    <source srcSet={data.webpSrcSet} sizes={data.sizes} type="image/webp" />
  )

  const regularSource = data.srcSet && (
    <source srcSet={data.srcSet} sizes={data.sizes} />
  )

  const placeholder = (
    <div
      style={{
        backgroundImage: data.base64 ? `url(${data.base64})` : null,
        backgroundColor: data.bgColor,
        backgroundSize: 'cover',
        opacity: showImage ? 0 : 1,
        transition:
          !fadeInDuration || fadeInDuration > 0
            ? `opacity ${fadeInDuration || 500}ms ${fadeInDuration || 500}ms`
            : null,
        ...absolutePositioning,
      }}
    />
  )

  const { width, aspectRatio } = data
  const height = data.height || width / aspectRatio

  const sizer = (
    <svg
      className={pictureClassName}
      style={{
        width: explicitWidth ? `${width}px` : '100%',
        height: 'auto',
        display: 'block',
        ...pictureStyle,
      }}
      height={height}
      width={width}
    />
  )

  return (
    <div
      ref={ref}
      className={className}
      style={{
        display: 'inline-block',
        overflow: 'hidden',
        ...style,
        position: 'relative',
      }}
    >
      {sizer}
      {placeholder}
      {addImage && (
        <picture
          style={{
            ...absolutePositioning,
            opacity: showImage ? 1 : 0,
            transition:
              !fadeInDuration || fadeInDuration > 0
                ? `opacity ${fadeInDuration || 500}ms`
                : null,
          }}
        >
          {webpSource}
          {regularSource}
          {data.src && (
            <img
              src={data.src}
              alt={data.alt}
              title={data.title}
              onLoad={handleLoad}
              style={{ width: '100%' }}
            />
          )}
        </picture>
      )}
      <noscript>
        <picture className={pictureClassName} style={{ ...pictureStyle }}>
          {webpSource}
          {regularSource}
          {data.src && <img src={data.src} alt={data.alt} title={data.title} />}
        </picture>
      </noscript>
    </div>
  )
}

export default Image
