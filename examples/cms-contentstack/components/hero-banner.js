import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function HeroBanner(props) {
  const banner = props?.hero_banner
  return (
    <div
      className="hero-banner"
      style={{
        background: banner?.bg_color ? banner.bg_color : '',
      }}
    >
      <div className={`${props.title === 'about' ? 'about' : 'home'}-content`}>
        {banner.banner_title && (
          <h1 className="hero-title">{banner.banner_title}</h1>
        )}
        {banner.banner_description && (
          <p
            className={`hero-description ${
              props.title === 'about' && 'about-desc'
            }`}
          >
            {banner?.banner_description}
          </p>
        )}
        {banner.call_to_action.title && banner.call_to_action.href ? (
          <Link href={banner?.call_to_action.href}>
            <a className="btn tertiary-btn">{banner?.call_to_action.title}</a>
          </Link>
        ) : (
          ''
        )}
      </div>
      {banner.banner_image && (
        <div className="h-banner-image">
          <Image
            src={banner.banner_image.url}
            alt={banner.banner_image.filename}
            layout="fill"
          />
        </div>
      )}
    </div>
  )
}
