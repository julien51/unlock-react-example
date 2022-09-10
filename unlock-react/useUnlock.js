import { useState, Context, createContext, useContext, useEffect } from "react"
import { ethers } from 'ethers'
// TODO: do we need _all_ of ethers just to check the signature and call 2 method on contracts?

/**
 * A shortened ABI for the lock since we only care about a small number of functions
 */
const abi = [{
  "inputs": [
    { "internalType": "address", "name": "_keyOwner", "type": "address" }
  ],
  "name": "totalKeys",
  "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
  "stateMutability": "view",
  "type": "function"
},
{
  "inputs": [
    { "internalType": "address", "name": "_keyOwner", "type": "address" },
    { "internalType": "uint256", "name": "_index", "type": "uint256" }
  ],
  "name": "tokenOfOwnerByIndex",
  "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [
    { "internalType": "uint256", "name": "_tokenId", "type": "uint256" }
  ],
  "name": "keyExpirationTimestampFor",
  "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
  "stateMutability": "view",
  "type": "function"
}]

/**
 * Returns a single membership
 * @param {*} network 
 * @param {*} lock 
 * @param {*} user 
 * @param {*} i 
 * @returns 
 */
const getMembership = async (network, lock, user, i) => {
  const provider = new ethers.providers.JsonRpcProvider(`https://rpc.unlock-protocol.com/${network}`)
  const contract = new ethers.Contract(lock, abi, provider)
  const tokenId = await contract.tokenOfOwnerByIndex(user, i)
  const expiration = await contract.keyExpirationTimestampFor(tokenId);
  return {
    network,
    lock,
    tokenId,
    expiration
  }
}

/**
 * An internal context
 */
const UnlockContext = createContext({
  deauthenticate: () => { },
  user: null,
  signature: null,
  digest: null,
  code: null, // Kept to keep user logged in when they make purchases!
})

/**
 * An Unlock hook
 * @param {*} config the paywall config object used for checkout
 * @returns an object
 */
export const useUnlock = (config) => {
  const unlockContext = useContext(UnlockContext)
  const [memberships, setMemberships] = useState([])
  const [loading, setLoading] = useState(false)


  /**
   * Authentication function
   */
  const authenticate = () => {
    let url = new URL("https://app.unlock-protocol.com/checkout");
    url.searchParams.set('client_id', window.location.host);
    url.searchParams.set('redirect_uri', window.location.href);
    window.location = url.toString()
  }

  /**
   * You can optionnaly pass a different config
   */
  const checkout = (_optionalConfig = null) => {
    let purchaseConfig = _optionalConfig || config
    purchaseConfig.pessimistic = true // We must wait for tx to succeed before redirecting!
    let url = new URL("https://app.unlock-protocol.com/checkout");
    url.searchParams.set('paywallConfig', JSON.stringify(purchaseConfig));
    let redirectUri = new URL(window.location.href)
    if (unlockContext.code) {
      redirectUri.searchParams.set('code', unlockContext.code)
    }
    url.searchParams.set('redirectUri', redirectUri.toString());
    window.location = url.toString()
  }

  /**
   * When the user changes, check if user is authorized
   */
  useEffect(() => {
    if (unlockContext.user && config.locks) {
      const getAllMemberships = async () => {
        setLoading(true)
        const _memberships = []
        await Promise.all(Object.keys(config.locks).map(async (lockAddress) => {
          const network = config.locks[lockAddress].network || config.network
          const provider = new ethers.providers.JsonRpcProvider(`https://rpc.unlock-protocol.com/${network}`)
          const contract = new ethers.Contract(lockAddress, abi, provider)
          const numberOfKeys = await contract.totalKeys(unlockContext.user)
          return Promise.all(new Array(numberOfKeys.toNumber()).fill(0).map(async (_, i) => {
            const membership = await getMembership(network, lockAddress, unlockContext.user, i)
            return _memberships.push(membership)
          }))
        }))
        setMemberships(_memberships)
        setLoading(false)
      }
      getAllMemberships()
    } else if (memberships.length > 0) {
      setMemberships([])
    }
  }, [unlockContext.user])

  /** Syntactic sugar */
  const isAuthorized = memberships.filter((membership) => { return membership.expiration * 1000 > new Date().getTime() }).length > 0

  return {
    loading,
    checkout,
    authenticate,
    isAuthorized,
    memberships,
    ...unlockContext,
  }
}

/**
 * A provider that needs to wrap your application
 * It is required to expose the user context
 * You can pass a `path` and `push` function that respectively 
 * expose the current path as well as a push function to update the
 * URL in the browser (useful to cleanup query params).
 * @param {*} param0 
 * @returns 
 */
export const UnlockProvider = ({ children, path, push }) => {
  const [context, setContext] = useState({
    deauthenticate: () => { },
    user: null,
    signature: null,
    digest: null,
    code: null
  })

  useEffect(() => {
    let url = new URL(path, window.location)
    const urlSearchParams = new URLSearchParams(url.search);
    const params = Object.fromEntries(urlSearchParams.entries());
    if (params.code) {
      const code = JSON.parse(atob(params.code))
      urlSearchParams.delete('code')
      urlSearchParams.delete('state')
      url.search = urlSearchParams.toString();
      const digest = code.d
      const signature = code.s
      const user = ethers.utils.verifyMessage(digest, signature)
      setContext({
        deauthenticate: () => setContext({}),
        code: params.code,
        user,
        digest,
        signature
      })
      if (typeof push === 'function') {
        push(url.toString())
      }
    }
  }, [path, push])


  return <UnlockContext.Provider value={context}>
    {children}
  </UnlockContext.Provider>
}