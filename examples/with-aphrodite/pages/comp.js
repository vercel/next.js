import { StyleSheet, css } from 'aphrodite'

const styles = StyleSheet.create({
  root: {
    width: 80,
    height: 60,
    background: 'red',
    ':hover': {
      background: 'green',
    },
  },
})

const Comp = () => {
  return <div className={css(styles.root)}>{'Comp'}</div>
}

export default Comp;

