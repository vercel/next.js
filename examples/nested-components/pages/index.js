import React from 'react'
import P from '../components/paragraph'
import Post from '../components/post'
import style from 'next/css'

export default () => (
  <div className={styles.main}>
    <Post title='My first blog post'>
      <P>Hello there</P>
      <P>This is an example of a componentized blog post</P>
    </Post>

    <Hr />

    <Post title='My second blog post'>
      <P>Hello there</P>
      <P>This is another example.</P>
      <P>Wa-hoo!</P>
    </Post>

    <Hr />

    <Post title='The final blog post'>
      <P>C'est fin</P>
    </Post>
  </div>
)

const Hr = () => <hr className={styles.hr} />

const styles = {
  main: style({
    margin: 'auto',
    maxWidth: '420px',
    padding: '10px'
  }),

  hr: style({
    width: '100px',
    borderWidth: 0,
    margin: '20px auto',
    textAlign: 'center',
    '::before': {
      content: '"***"',
      color: '#ccc'
    }
  })
}
