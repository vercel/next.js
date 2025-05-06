// local redefinition of __webpack_load__ does not need instrumenting
async function __webpack_load__(id) {
    console.log(id);
}
export default async function Page() {
    await __webpack_load__('some-chunk');
    return null;
}
