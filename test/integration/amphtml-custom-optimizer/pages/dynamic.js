export const config = {
  amp: true,
}

const Dynamic = (props) => (
  <amp-img
    width="500"
    height="500"
    layout="responsive"
    src={props.src}
  ></amp-img>
)

Dynamic.getInitialProps = () => {
  return {
    src: 'https://amp.dev/static/samples/img/story_dog2_portrait.jpg',
  }
}

export default Dynamic
