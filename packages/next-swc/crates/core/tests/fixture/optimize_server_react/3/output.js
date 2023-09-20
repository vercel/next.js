import { useState } from 'react';
export default function App({ x }) {
    const state = 0, setState = ()=>null;
    const [state2, setState2] = useState(()=>0);
    const [state3, setState3] = useState(x);
    const s = useState(0);
    const [state4] = useState(0);
    const { a } = {
        a: 0
    }, setState5 = ()=>null;
    return <div>

      <h1>Hello World</h1>

    </div>;
}
