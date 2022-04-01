import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function Section({ section }) {
  function contentSection(key) {
    return (
      <div className="home-content" key={key}>
        {section.title_h2 && (
          <h2 {...section.$?.title_h2}>{section.title_h2}</h2>
        )}
        {section.description && (
          <p {...section.$?.description}>{section.description}</p>
        )}
        {section.call_to_action.title && section.call_to_action.href ? (
          <Link href={section.call_to_action.href}>
            <a
              className="btn secondary-btn"
              {...section.call_to_action.$?.title}
            >
              {section.call_to_action.title}
            </a>
          </Link>
        ) : (
          ''
        )}
      </div>
    )
  }

  function imageContent(key) {
    return (
      <Image
        layout="fill"
        key={key}
        src={section.image.url}
        alt={section.image.filename}
        {...section.image.$?.url}
      />
    )
  }
  return (
    <div className="home-advisor-section">
      {section.image_alignment === 'Left'
        ? [imageContent('key-image'), contentSection('key-contentstection')]
        : [contentSection('key-contentstection'), imageContent('key-image')]}
    </div>
  )
}
