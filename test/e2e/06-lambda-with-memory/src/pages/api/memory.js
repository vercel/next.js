export default function (req, res) {
  res.end(`${process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE}`)
}
