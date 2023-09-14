import { useState } from 'react';
export default function App({ x }) {
    const state = 0, setState = ()=>null;
    const state2 = ()=>0, setState2 = ()=>null;
    const state3 = x, setState3 = ()=>null;
    const s = useState(0);
    const [state4] = useState(0);
    const { a } = {
        a: 0
    }, setState5 = ()=>null;
    return <div>

      <h1>Hello World</h1>

    </div>;
}
