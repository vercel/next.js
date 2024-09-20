console.log("side effect: before")

if(1 +2 !==3){
  throw new Error("1 + 2 !== 3");
}

console.log("side effect: after");
