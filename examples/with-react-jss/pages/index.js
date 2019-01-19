import React from 'react'
import injectSheet from 'react-jss'

const styles = {
  container: {
    marginTop: 100,
    textAlign: 'center'
  },

  header: {
    fontSize: 24,
    lineHeight: 1.25
  }
}

function Index (props) {
  return (
    <div className={props.classes.container}>
      <h1 className={props.classes.header}>
        Example on how to use react-jss with Next.js
      </h1>
    </div>
  )
}

export default injectSheet(styles)(Index)
