import rl from 'readline';

export default function (question) {
  const rlInterface = rl.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rlInterface.question(question + '\n', function(answer) {
      rlInterface.close();
      resolve(answer);
    });
  });
};
