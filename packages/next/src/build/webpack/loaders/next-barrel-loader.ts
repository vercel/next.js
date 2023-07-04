export default function transformSource(
  this: any,
  source: string,
  sourceMap: any
) {
  console.log(this.resourcePath)
  return this.callback(null, source, sourceMap)
}
