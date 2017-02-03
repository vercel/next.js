import React from 'react'
import Cat from '../svgs/cat.svg'

export default () => (
  <div className='container'>
    <marquee>SVG Cat!</marquee>
    <Cat />
    <style jsx>{`
      .container {
        width: 600px;
        margin: 100px auto;
      }
    `}</style>
  </div>
)
