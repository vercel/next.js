export default function Page() {
    useLayoutEffect({
        "Page.useLayoutEffect": ()=>{}
    }["Page.useLayoutEffect"]);
    useEffect({
        "Page.useEffect": ()=>{}
    }["Page.useEffect"]);
    const onClick = useCallback({
        "Page.useCallback[onClick]": ()=>[]
    }["Page.useCallback[onClick]"]);
    const computed = useMemo({
        "Page.useMemo[computed]": ()=>{}
    }["Page.useMemo[computed]"]);
}
