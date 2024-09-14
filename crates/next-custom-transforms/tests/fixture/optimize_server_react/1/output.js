import { useEffect, useLayoutEffect, useMemo } from 'react';
import React from 'react';
export default function App() {
    process.env.NODE_ENV !== "production" ? useEffect(()=>{
        console.log('Hello World');
    }, []) : null;
    process.env.NODE_ENV !== "production" ? useLayoutEffect(()=>{
        function foo() {}
        return ()=>{};
    }, [
        1,
        2,
        App
    ]) : null;
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
    process.env.NODE_ENV !== "production" ? React.useEffect(()=>{
        console.log('Hello World');
    }) : null;
    return <div>
      <h1>Hello World</h1>
    </div>;
}
