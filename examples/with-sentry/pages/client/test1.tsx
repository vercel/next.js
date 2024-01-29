const doAsyncWork = () => Promise.reject(new Error("Client Test 1"));
doAsyncWork();

const Test1 = () => <h1>Client Test 1</h1>;

export default Test1;
