import React from 'react'
import P from '../components/paragraph'
import Post from '../components/post'
import { css, StyleSheet } from 'next/css'

export default () => (
  <div className={css(styles.main)}>
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

const Hr = () => <hr className={css(styles.hr)} />

const styles = StyleSheet.create({
  main: {
    margin: 'auto',
    maxWidth: '420px',
    padding: '10px'
  },

  hr: {
    width: '100px',
    borderWidth: 0,
    margin: '20px auto',
    textAlign: 'center',
    ':before': {
      content: '"***"',
      color: '#ccc'
    }
  }
})
