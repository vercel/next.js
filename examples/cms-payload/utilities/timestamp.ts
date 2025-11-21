export const timestamp = (label) => {
  if (!process.env.PAYLOAD_TIME)
    process.env.PAYLOAD_TIME = String(new Date().getTime());
  const now = new Date();
  console.log(
    `[${now.getTime() - Number(process.env.PAYLOAD_TIME)}ms] ${label}`,
  );
};
