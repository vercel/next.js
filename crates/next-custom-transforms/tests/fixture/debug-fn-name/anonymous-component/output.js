const Component = ()=>{
    useLayoutEffect({
        "Component.useLayoutEffect": ()=>{}
    }["Component.useLayoutEffect"]);
    useEffect({
        "Component.useEffect": ()=>{}
    }["Component.useEffect"]);
    const onClick = useCallback({
        "Component.useCallback[onClick]": ()=>[]
    }["Component.useCallback[onClick]"]);
    const computed = useMemo({
        "Component.useMemo[computed]": ()=>{}
    }["Component.useMemo[computed]"]);
};
