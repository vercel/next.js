/** @type {import('next').NextConfig} */
export default {
  instrumentationClientInject: [
    './inject-side-effect.cjs',
    './inject-late-hook.cjs',
    './inject-a.js',
    './inject-b.js',
  ],
}
