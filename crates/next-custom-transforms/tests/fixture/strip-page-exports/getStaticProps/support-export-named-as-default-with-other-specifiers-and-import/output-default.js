import { useContext, createContext } from 'react';
export var __N_SSG = true;
export const context = createContext();
function El() {
    const value = useContext(context);
    return __jsx("div", null);
}
const a = 5;
export { El as default, a };
