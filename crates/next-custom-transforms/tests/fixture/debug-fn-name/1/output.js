function MyComponent() {
    useLayoutEffect({
        "MyComponent.useLayoutEffect": ()=>{}
    }["MyComponent.useLayoutEffect"]);
    useEffect({
        "MyComponent.useEffect": ()=>{}
    }["MyComponent.useEffect"]);
    const onClick = useCallback({
        "MyComponent.useCallback": ()=>[]
    }["MyComponent.useCallback"]);
    const computed = useMemo({
        "MyComponent.useMemo": ()=>{}
    }["MyComponent.useMemo"]);
}
