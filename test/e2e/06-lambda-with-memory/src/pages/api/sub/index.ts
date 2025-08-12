export default function (req: any, res: any) {
  res.end(`${process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE}`)
}
