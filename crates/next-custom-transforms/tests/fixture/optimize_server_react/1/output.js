import { useEffect, useLayoutEffect, useMemo } from 'react';
import React from 'react';
export default function App() {
    process.env.__NEXT_PRIVATE_MINIMIZE_MACRO_FALSE && useEffect(()=>{
        console.log('Hello World');
    }, []);
    process.env.__NEXT_PRIVATE_MINIMIZE_MACRO_FALSE && useLayoutEffect(()=>{
        function foo() {}
        return ()=>{};
    }, [
        1,
        2,
        App
    ]);
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
    process.env.__NEXT_PRIVATE_MINIMIZE_MACRO_FALSE && React.useEffect(()=>{
        console.log('Hello World');
    });
    return <div>
      <h1>Hello World</h1>
    </div>;
}
