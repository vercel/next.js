import { ContentBlocks } from './content-blocks'
import DateComponent from './date'
import Avatar from './avatar'

export default function PostBody({ content }) {
  return (
    <div className="prose lg:prose-xl max-w-2xl mx-auto">
      <div className="block md:hidden mb-6">
        {content.author.length ? (
          <Avatar
            name={`${content.author[0].firstName} ${content.author[0].lastName}`}
            picture={content.author[0].profilePhoto}
          />
        ) : null}
      </div>
      <div className="mb-6 text-lg">
        {content.postingDate !== 'now' ? (
          <div className="mb-6 text-lg">
            Posted <DateComponent dateString={content.postingDate} />
          </div>
        ) : null}
      </div>
      <ContentBlocks content={content.blogContent.json.content} />
    </div>
  )
}
