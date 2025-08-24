if (typeof process.loadEnvFile === 'function') {
    console.log(process.loadEnvFile());
}
typeof process.loadEnvFile === 'function' && process.loadEnvFile();
console.log(process.loadEnvFile());
