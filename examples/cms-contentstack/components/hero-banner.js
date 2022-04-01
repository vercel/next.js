import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function HeroBanner({ banner, title }) {
  return (
    <div
      className="hero-banner"
      style={{
        background: banner?.bg_color ? banner.bg_color : '',
      }}
    >
      <div className={`${title === 'about' ? 'about' : 'home'}-content`}>
        {banner.banner_title && (
          <h1 className="hero-title" {...banner.$?.banner_title}>
            {banner.banner_title}
          </h1>
        )}
        {banner.banner_description && (
          <p
            className={`hero-description ${
              title === 'about' && 'about-desc'
            }`}
            {...banner.$?.banner_description}
          >
            {banner?.banner_description}
          </p>
        )}
        {banner.call_to_action.title && banner.call_to_action.href ? (
          <Link href={banner?.call_to_action.href}>
            <a className="btn tertiary-btn" {...banner.call_to_action.$?.title}>
              {banner?.call_to_action.title}
            </a>
          </Link>
        ) : (
          ''
        )}
      </div>
      {banner.banner_image && (
        <div className="h-banner-image" {...banner.banner_image.$?.url}>
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
