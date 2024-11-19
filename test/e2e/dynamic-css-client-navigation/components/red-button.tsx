import classes from './red.module.css'

export function RedButton() {
  return (
    <button id="red-button" className={classes.button}>
      My background should be red!
    </button>
  )
}
