// exported!
export async function a() {
    // this is not allowed here
    this.foo();
    // arguments is not allowed here
    console.log(arguments);
    const b = async ()=>{
        // this is not allowed here
        this.foo();
        // arguments is not allowed here
        console.log(arguments);
    };
    function c() {
        // this is allowed here
        this.foo();
        // arguments is allowed here
        console.log(arguments);
        const d = ()=>{
            // this is allowed here
            this.foo();
            // arguments is allowed here
            console.log(arguments);
        };
        const e = async ()=>{
            // this is not allowed here
            this.foo();
            // arguments is not allowed here
            console.log(arguments);
        };
    }
}
