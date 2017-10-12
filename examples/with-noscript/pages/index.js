import React from 'react'
import LazyLoad from 'react-lazyload'
import Noscript from '../components/Noscript'

const images = [
  '/static/img/reactjs.png',
  '/static/img/nextjs.png',
  '/static/img/vuejs.png',
  '/static/img/angular.jpg'
]

class Index extends React.Component {
  static getInitialProps (context) {
    const { isServer } = context
    return { isServer }
  }
  render () {
    return (
      <div style={{ textAlign: 'center' }}>
        {
          images.map((item, index) =>
            <div key={index}>
              <LazyLoad height={700} offset={100}>
                <img width={700} height={700} src={item} alt={`image_${index}`} />
              </LazyLoad>
              <Noscript>
                <img width={700} height={700} src={item} alt={`image_${index}`} />
              </Noscript>
            </div>
          )
        }
      </div>
    )
  }
}

export default Index
