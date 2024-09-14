const useEffect = 1;
import { useLayoutEffect, useMemo } from 'react';
const React = 2;
export default function App() {
    useEffect(()=>{
        console.log('Hello World');
    }, []);
    process.env.NODE_ENV !== "production" ? useLayoutEffect(()=>{
        function foo() {}
        return ()=>{};
    }, [
        1,
        2,
        App
    ]) : null;
    const a = useMemo(()=>{
        return 1;
    }, []);
    React.useEffect(()=>{
        console.log('Hello World');
    });
    return <div>
      <h1>Hello World</h1>
    </div>;
}
