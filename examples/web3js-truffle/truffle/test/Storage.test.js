const truffleAssert = require("truffle-assertions");
const StorageContract = artifacts.require("Storage");

contract("Storage", (accounts) => {
  // accounts
  // const creatorAddress = accounts[0];
  // const firstOwnerAddress = accounts[1];
  // const secondOwnerAddress = accounts[2];
  // const externalAddress = accounts[3];
  // const unprivilegedAddress = accounts[4];

  /* create named accounts for contract roles */

  before(async () => {
    /* before tests */
    const contractInstance = StorageContract.deployed();

    assert(
      contractInstance !== undefined,
      "Storage contract should be deployed properly"
    );
  });

  beforeEach(async () => {
    /* before each context */
  });

  context("store/retrieve tests...", () => {
    let newStorageInstance;
    //deploy a new contract
    before(async () => {
      /* before tests */
      newStorageInstance = await StorageContract.new();
    });

    beforeEach(async () => {
      /* before each tests */
    });

    it("checks if first retrieve value is 0", async () => {
      assert.equal((await newStorageInstance.retrieve()).toNumber(), 0);
    });

    it("store new value, and using retrieve", async () => {
      const receipt = await newStorageInstance.store(17); // storing 17

      // checking for Stored event:
      await truffleAssert.eventEmitted(receipt, "Stored", (event) => {
        // since numeric values in javascript do not have enough precision they are wrapped in an BN object. We can use those BN methods.
        // see BN docs: https://github.com/indutny/bn.js/#utilities
        return (
          event.number.toString() == (17).toString() // can't do toNumber() as js can't hold numbers that big
        );
      });

      assert.equal((await newStorageInstance.retrieve()).toNumber(), 17); // checking if 17 is stored
    });
  });
});
