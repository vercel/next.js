import P from '../components/paragraph'
import Post from '../components/post'

export default () => (
  <div className='main'>
    <Post title='My first blog post'>
      <P>Hello there</P>
      <P>This is an example of a componentized blog post</P>
    </Post>

    <hr />

    <Post title='My second blog post'>
      <P>Hello there</P>
      <P>This is another example.</P>
      <P>Wa-hoo!</P>
    </Post>

    <hr />

    <Post title='The final blog post'>
      <P>C’est fin</P>
    </Post>

    <style jsx>{`
      .main {
        margin: auto;
        max-width: 420px;
        padding: 10px;
      }

      hr {
        width: 100px;
        border-width: 0;
        margin: 20px auto;
        text-align: center;
      }

      hr::before {
        content: "***";
        color: #ccc;
      }
    `}</style>
  </div>
)
