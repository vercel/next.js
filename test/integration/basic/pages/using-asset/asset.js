import asset from 'next/asset'

export default () => (
  <div id='asset-page'>
    <img id='img1' src={asset('/the-image')} />
    <img id='img2' src={asset('the-image')} />
    <img id='img3' src={asset('http://the-image.com/the-image')} />
    <img id='img4' src={asset('https://the-image.com/the-image')} />
  </div>
)
