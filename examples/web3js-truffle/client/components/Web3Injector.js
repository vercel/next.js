import Web3 from "web3";
import { useEffect, useState } from "react";
import Loader from "./Loader";

const Web3Injector = ({ Component }) => {
  const [web3State, setWeb3State] = useState({});

  useEffect(() => {
    const setUp = async () => {
      const { web3, accounts, contract } = await establishConnection();
      setWeb3State((prevSrate) => {
        return {
          ...prevSrate,
          web3,
          accounts,
          contract
        };
      });
    };
    setUp();
  }, []);
  return (
    <>
      {web3State.web3 && web3State.accounts && web3State.contract ? (
        <Component {...web3State} />
      ) : (
        <Loader />
      )}
    </>
  );
};

/**
 *
 * @returns {Promise<Web3>} web3
 *          The web3 object with the provider.
 * @returns {Promise<Array>} accounts
 *          All availible accounts.
 * @returns {Promise<Web3.eth.Contract>} contract
 *          The contract.
 */
const establishConnection = async () => {
  // establishing connection to testRPC
  const web3Provider = new Web3.providers.WebsocketProvider(
    "ws://localhost:8545"
  );
  const artifact = require("../../truffle/build/contracts/Storage.json");

  let web3, accounts, contract;
  try {
    web3 = new Web3(web3Provider);
    accounts = await web3.eth.getAccounts();
    const networkID = await web3.eth.net.getId();
    const address = artifact.networks[networkID].address;
    contract = new web3.eth.Contract(artifact.abi, address);
  } catch (err) {
    console.error(err);
  }

  return {
    web3,
    accounts,
    contract
  };
};

export default Web3Injector;
