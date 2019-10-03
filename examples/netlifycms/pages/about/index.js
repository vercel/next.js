import React from 'react'

import content from '../../content/about.md'

const About = () => {
  const { attributes, html } = content
  return (
    <React.Fragment>
      <h1>{attributes.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <style jsx>{`
        h1,
        div {
          text-align: center;
        }
      `}</style>
    </React.Fragment>
  )
}
export default About
