const unstable_instant = {
    prefetch: 'static'
};
export { unstable_instant };
export default function Page() {
    return <div>Hello</div>;
}
export const __debugCreateInstantConfigStack = process.env.NODE_ENV !== 'production' ? function unstable_instant() {
    const error = new Error(' ');
    error.name = 'Instant Validation';
    return error;
} : null;
