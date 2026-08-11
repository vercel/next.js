import Image from 'next/image'

export default function PostBody({ content }) {
  const blocks = (content || []).map((item, index) => {
    if (item.__typename === 'Text') {
      return (
        <div
          key={index}
          dangerouslySetInnerHTML={{ __html: item.html }}
        ></div>
      )
    }
    if (item.__typename === 'Assets') {
      return (item.items || []).map((asset, i) => (
        <Image
          key={`${index}-${i}`}
          src={asset.url}
          alt=""
          width={1000}
          height={500}
          className="my-8 rounded-2xl"
        />
      ))
    }
    return null
  })

  return <div className="article mx-auto max-w-2xl">{blocks}</div>
}
