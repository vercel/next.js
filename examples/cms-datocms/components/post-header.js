import Avatar from '../components/avatar'
import Date from '../components/date'
import layoutStyles from './layout-styles.module.css'

export default function PostHeader() {
  return (
    <>
      <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-tight md:leading-none mb-12 text-center md:text-left">
        Deploying Next.js Apps
      </h1>
      <div className="hidden md:block md:mb-12">
        <Avatar />
      </div>
      <div className="mb-8 md:mb-16 -mx-5 sm:mx-0">
        <img src="/images/image.jpg" className="shadow-magical" />
      </div>
      <div className={layoutStyles['post-body-container']}>
        <div className="block md:hidden mb-6">
          <Avatar />
        </div>
        <div className="mb-6">
          <Date dateString="2020-03-04" />
        </div>
      </div>
    </>
  )
}
