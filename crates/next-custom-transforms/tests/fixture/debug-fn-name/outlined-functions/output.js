function C() {
    function handleClick() {}
    const onClick = useCallback(handleClick, []);
}
