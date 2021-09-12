import React, { Component } from 'react'
import Slider from 'react-slick'
import styles from './ReactSlick.module.css'

function SampleNextArrow(props) {
  const { className, style, onClick } = props
  return (
    <div
      className={className}
      style={{ ...style, display: 'block', background: 'red' }}
      onClick={onClick}
    />
  )
}

function SamplePrevArrow(props) {
  const { className, style, onClick } = props
  return (
    <div
      className={className}
      style={{ ...style, display: 'block', background: 'green' }}
      onClick={onClick}
    />
  )
}
const ReactSlickSlider = () => {
  const settings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    nextArrow: <SampleNextArrow />,
    prevArrow: <SamplePrevArrow />,
  }

  return (
    <div>
      <Slider {...settings}>
        {[1, 2, 3, 4, 5, 6].map((carouselItem) => {
          return (
            <div key={carouselItem}>
              <div className={styles.carouselItem}>{carouselItem}</div>
            </div>
          )
        })}
      </Slider>
    </div>
  )
}
export default ReactSlickSlider
