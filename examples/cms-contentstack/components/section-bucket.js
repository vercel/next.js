import React from 'react'
import Link from 'next/link'
import parse from 'html-react-parser'

class SectionBucket extends React.Component {
  render() {
    const { section } = this.props
    return (
      <div className="member-main-section">
        <div className="member-head">
          {section.title_h2 && <h2>{section.title_h2}</h2>}
          {section.description && <p>{section.description}</p>}
        </div>
        <div className="member-section">
          {section.buckets?.map((bucket, index) => (
            <div className="content-section" key={index}>
              {bucket.icon && <img src={bucket.icon.url} alt="bucket icon" />}

              {bucket.title_h3 ? <h3>{bucket.title_h3}</h3> : ''}
              {typeof bucket.description === 'string' && (
                <div>{parse(bucket.description)}</div>
              )}
              {bucket.call_to_action.title ? (
                <Link
                  href={
                    bucket.call_to_action.href
                      ? bucket.call_to_action.href
                      : '#'
                  }
                >
                  {`${bucket.call_to_action.title} -->`}
                </Link>
              ) : (
                ''
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }
}

export default SectionBucket
