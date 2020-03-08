import textStyles from '../components/text-styles.module.css'
import Avatar from '../components/avatar'
import Date from '../components/date'
import cn from 'classnames'

export default function PostPreview({ title }) {
  return (
    <div>
      <div className="-mx-5 sm:mx-0">
        <img src="/images/image.jpg" className="mb-5 shadow-magical" />
      </div>
      <h3 className="text-3xl mb-3 leading-snug">{title}</h3>
      <div className="text-lg mb-4 text-accent-5">
        <Date />
      </div>
      <p className={cn(textStyles['body-text'], 'mb-4')}>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod
        tempor incididunt ut labore et dolore magna aliqua. Praesent elementum
        facilisis leo vel fringilla est ullamcorper eget. At imperdiet dui
        accumsan sit amet nulla facilisi morbi tempus.
      </p>
      <Avatar />
    </div>
  )
}
