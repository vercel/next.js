import { useState } from 'react';
export default function App({ x }) {
    const [state, setState] = [
        0,
        ()=>null
    ];
    const [state2, setState2] = useState(()=>0);
    const [state3, setState3] = useState(x);
    const s = useState(0);
    const [state4] = useState(0);
    const [{ a }, setState5] = [
        {
            a: 0
        },
        ()=>null
    ];
    return <div>
      <h1>Hello World</h1>
    </div>;
}
