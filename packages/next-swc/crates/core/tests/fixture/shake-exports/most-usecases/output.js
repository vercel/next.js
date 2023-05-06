let shouldBeKept = 'should be kept';
export async function keep() {
    console.log(shouldBeKept);
}
export let keep1 = 'should be kept';
export let keep2 = 'should be kept';
let keep3 = 'should be kept';
let asKeep = 'should be kept';
export { keep3, asKeep as keep4 };
function ShouldBeKept() {
    return 'should be kept';
}
let shouldBeKept2 = 'should be kept';
export function keep5() {
    return <ShouldBeKept val={shouldBeKept2}/>;
}
