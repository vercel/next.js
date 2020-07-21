import DateFormater from '../components/date-formater'
import PostTitle from '../components/post-title'

export default function PostHeader({ title, coverImage, date, author }) {
  return (
    <>
      <div className="mb-6 text-lg">
        <DateFormater dateString={date} strFormat="LLLL	d, yyyy" />
      </div>
      <PostTitle>{title}</PostTitle>
    </>
  )
}
