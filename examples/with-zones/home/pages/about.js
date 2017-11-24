import asset from 'next/asset'

export default () => (
  <div>
    <p>This is the about page.</p>
    <img width={200} src={asset('/zeit.png')} />
  </div>
)
