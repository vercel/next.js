export default async function transformSource(this: any): Promise<string> {
  const { absolutePagePath } = this.getOptions()
  return `
    import ComponentRef from 'next-flight-client-loader!${absolutePagePath}';

    export const noop = () => require('${absolutePagePath}');

    export default ComponentRef;
  `
}
