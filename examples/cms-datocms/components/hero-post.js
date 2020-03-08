import textStyles from '../components/text-styles.module.css'
import cn from 'classnames'
import Avatar from '../components/avatar'
import Date from '../components/date'

export default function HeroPost() {
  return (
    <>
      <div className="mb-8 md:mb-16 -mx-5 sm:mx-0">
        <img src="/images/image.jpg" className="shadow-magical" />
      </div>
      <div className="md:grid md:grid-cols-2 md:col-gap-16 lg:col-gap-8 mb-20 md:mb-28">
        <div>
          <h3 className="mb-4 text-4xl lg:text-6xl leading-tight">
            Learn How to Pre-render Pages Using Static Generation with Next.js
          </h3>
          <div className="mb-4 md:mb-0">
            <Date />
          </div>
        </div>
        <div>
          <p className={cn(textStyles['body-text'], 'mb-4')}>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
            eiusmod tempor incididunt ut labore et dolore magna aliqua. Praesent
            elementum facilisis leo vel fringilla est ullamcorper eget. At
            imperdiet dui accumsan sit amet nulla facilisi morbi tempus.
          </p>
          <Avatar />
        </div>
      </div>
    </>
  )
}
