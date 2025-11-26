import * as data from 'example'
import * as classes from 'example/index.module.scss'

function Home() {
  return (
    <div id="nm-div">
      <div className={classes.other2} id="other2">
        Other 2
      </div>
      {/* Does not exist */}
      <div className={classes.other3} id="other3">
        Other 3
      </div>
      <div className={classes.subClass} id="subclass">
        Sub class
      </div>
      {JSON.stringify(data)} {JSON.stringify(classes)}
    </div>
  )
}

export default Home
