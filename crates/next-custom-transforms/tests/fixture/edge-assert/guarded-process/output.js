if (typeof process.loadEnvFile === 'function') {
    console.log(process.loadEnvFile());
}
typeof process < 'u' && typeof process.off == 'function' && (process.off('uncaughtException', this.onUncaughtException), process.off('unhandledRejection', this.onUncaughtRejection));
