const instantConfig = {
    prefetch: 'static'
};
export { instantConfig as instant };
export default function Page() {
    return <div>Hello</div>;
}
export const __debugCreateInstantConfigStack = process.env.NODE_ENV !== 'production' ? function instant() {
    const error = new Error(' ');
    error.name = 'Instant Validation';
    return error;
} : null;
