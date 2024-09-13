import { useEffect, useLayoutEffect, useMemo } from 'react';
import React from 'react';
export default function App() {
    null;
    null;
    useLayoutEffect(()=>{}, [
        runSideEffect()
    ]);
    useEffect(()=>{}, [
        1,
        runSideEffect(),
        2
    ]);
    useEffect(()=>{}, getArray());
    const a = useMemo(()=>{
        return 1;
    }, []);
    null;
    return <div>
      <h1>Hello World</h1>
    </div>;
}
