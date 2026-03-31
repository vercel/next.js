if (process.env.NEXT_RUNTIME === 'edge') {
    setTimeout(cb, 0);
} else {
    setImmediate(cb);
}
