import prompt from './prompt';
import detect from 'detect-port';
import chalk from 'chalk';

const defaults = { shouldPrompt: true };
export default async function run(opts) {
  const { srv, port: desiredPort, shouldPrompt } = { ...defaults, ...opts };
  const port = await detect(desiredPort);
  if (port !== desiredPort) {
    if (!shouldPrompt) {
      // Fail early if no prompt
      console.error(`Error: Something is already running at port ${desiredPort}. Exiting.`);
      process.exit(1);
    }

    // Prompt the user to change the port.
    let shouldChangePort = false;
    if (shouldPrompt) {
      const question = chalk.red(`Something is already running at port ${desiredPort}.\n` +
        `Would you like to run the app on port ${port} instead? [Y/n]`);
      const answer = await prompt(question);
      shouldChangePort = !answer.length || answer.match(/^yes|y$/i);
    }
    if (!shouldChangePort) {
      console.log(chalk.red('Exiting.'));
      process.exit(0);
    }
  }
  await srv.start(port);
  console.log(`Ready on ${chalk.cyan(`http://localhost:${port}`)}`);
}
