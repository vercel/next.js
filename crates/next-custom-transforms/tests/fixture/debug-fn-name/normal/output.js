function MyComponent() {
    useLayoutEffect({
        "MyComponent.useLayoutEffect": ()=>{}
    }["MyComponent.useLayoutEffect"]);
    useEffect({
        "MyComponent.useEffect": ()=>{}
    }["MyComponent.useEffect"]);
    const onClick = useCallback({
        "MyComponent.useCallback[onClick]": ()=>[]
    }["MyComponent.useCallback[onClick]"]);
    const computed = useMemo({
        "MyComponent.useMemo[computed]": ()=>{}
    }["MyComponent.useMemo[computed]"]);
}
