import { foo, bar } from 'thing';
export function otherExport() {
    foo;
    bar;
}
export async function getStaticProps() {
    bar;
}
