const _instant = {
    prefetch: 'static'
};
const instant = _instant;
export { instant as unstable_instant };
export default function Page() {
    return <div>Hello</div>;
}
export const __debugCreateInstantConfigStack = process.env.NODE_ENV !== 'production' ? function unstable_instant() {
    const error = new Error(' ');
    error.name = 'Instant Validation';
    return error;
} : null;
