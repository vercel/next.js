const StorageContract = artifacts.require('Storage')

module.exports = async function (deployer, network, accounts) {
  await deployer.deploy(StorageContract)
}
