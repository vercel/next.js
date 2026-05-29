function useSomething() {
    useLayoutEffect({
        "useSomething.useLayoutEffect": ()=>{}
    }["useSomething.useLayoutEffect"]);
    useEffect({
        "useSomething.useEffect": ()=>{}
    }["useSomething.useEffect"]);
    const onClick = useCallback({
        "useSomething.useCallback[onClick]": ()=>[]
    }["useSomething.useCallback[onClick]"]);
    const computed = useMemo({
        "useSomething.useMemo[computed]": ()=>{}
    }["useSomething.useMemo[computed]"]);
}
