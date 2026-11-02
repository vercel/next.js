console.log(
  `${process.argv[2]}: pending=${process.env.NODE_PENDING_DEPRECATION || '0'}`
)
console.log(process.env.NODE_OPTIONS)
void module.parent
