import Head from 'next/head'
import styles from '../styles/Home.module.css'
import { useState } from 'react'
import Web3Injector from '../components/Web3Injector'

const Home = ({ web3, accounts, contract }) => {
  const [inpState, setInpState] = useState('')
  const [contractData, setContractData] = useState('')

  // retrieving data from the contract
  const retrieveData = async () => {
    const data = await contract.methods.retrieve().call({ from: accounts[0] })
    setContractData(data)
  }

  // storing data on the contract
  const storeData = async () => {
    try {
      const receipt = await contract.methods
        .store(inpState)
        .send({ from: accounts[0] })
      const eventData = receipt.events.Stored.returnValues[0]
      setInpState('')
      alert(`Value has been set to ${eventData}, click on GET`)
    } catch (error) {
      console.log(error)
    }
  }

  const handleChange = (e) => {
    setInpState(e.target.value)
  }

  return (
    <>
      <div className={styles.container}>
        <Head>
          <title>Next-Web3-Truffle App</title>
          <meta name="description" content="Next-Web3-Truffle App" />
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <div className={styles.grid}>
          <main>
            <div className={styles.title}>Next-Web3-Truffle App</div>
            <p>
              A boilerplate for building dapps using Next.js, Web3 and Truffle.
            </p>
            <div className={styles.card}>
              <h2>Set value:</h2>

              <input
                type="number"
                name="setNameInp"
                onChange={handleChange}
                value={inpState}
                required={true}
              />
              <button onClick={storeData}>Set</button>
            </div>
            <div className={styles.card}>
              <h2>Get current value:</h2>
              <input
                type="number"
                name="getNameInp"
                disabled={true}
                value={contractData}
              />
              <button onClick={retrieveData}>Get</button>
            </div>
          </main>
        </div>
      </div>
    </>
  )
}

export default () => <Web3Injector Component={Home} />
