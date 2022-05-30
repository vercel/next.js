import something from '../apples'
export default () => {
  // have to do something with module so it is not tree shaken
  console.log(something)
  return '2'
}
