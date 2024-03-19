import { createContext } from 'react';
export const context = createContext();
export function getStaticProps() {
    return {
        props: {}
    };
}
const a = 5;
export { a };
