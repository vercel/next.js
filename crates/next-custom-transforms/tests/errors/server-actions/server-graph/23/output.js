// not exported!
async function a() {
    // this is allowed here
    this.foo();
    // arguments is allowed here
    console.log(arguments);
    const b = async ()=>{
        // this is not allowed here
        this.foo();
        // arguments is not allowed here
        console.log(arguments);
    };
}
export const obj = {
    foo () {
        return 42;
    },
    bar () {
        // this is allowed here
        this.foo();
        // arguments is allowed here
        console.log(arguments);
    }
};
