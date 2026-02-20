export const unstable_instant = {
    prefetch: 'static'
};
export default function Page() {
    return <div>Hello</div>;
}
export const __debugInstantStack = process.env.NODE_ENV !== 'production' ? function unstable_instant() {
    const previousStackTraceLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = 1;
    const error = new Error('​');
    Error.stackTraceLimit = previousStackTraceLimit;
    error.name = 'Instant Validation';
    return error;
}() : undefined;
