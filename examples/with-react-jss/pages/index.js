import { createUseStyles } from 'react-jss'

const useStyles = createUseStyles({
  container: {
    marginTop: 100,
    textAlign: 'center',
  },

  header: {
    fontSize: 24,
    lineHeight: 1.25,
  },
})

function Index() {
  const classes = useStyles()

  return (
    <div className={classes.container}>
      <h1 className={classes.header}>
        Example on how to use react-jss with Next.js
      </h1>
    </div>
  )
}

export default Index
