let x = "abc",
  y = "def";
let data = {};
data[x] = true;
data[y] = true;

export default function(a) {
	return data[a];
}
