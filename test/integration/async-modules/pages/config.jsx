export const config = {
  amp: true,
}

await Promise.resolve('tadaa')

export default function Config() {
  const date = new Date()
  return (
    <div>
      <amp-timeago
        id="amp-timeago"
        width="0"
        height="15"
        datetime={date.toJSON()}
        layout="responsive"
      >
        fail
      </amp-timeago>
    </div>
  )
}
