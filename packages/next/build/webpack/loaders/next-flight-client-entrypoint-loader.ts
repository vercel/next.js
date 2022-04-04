export default async function transformSource(this: any): Promise<string> {
  const { absolutePagePath } = this.getOptions()
  return `
    import ComponentRef from '${absolutePagePath}?__sc_client__';

    export const noop = () => require('${absolutePagePath}');

    export default ComponentRef;
  `
}
