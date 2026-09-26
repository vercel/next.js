if (
  process.env.NEXT_PRIVATE_UPGRADE_SUPERVISED === '1' &&
  process.argv[2] === 'build'
) {
  console.log('UPGRADE_BUILD_LOG')
}

module.exports = {
  experimental: {
    agenticAutoUpgrade: 'future',
  },
}
