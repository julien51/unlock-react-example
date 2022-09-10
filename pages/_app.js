import '../styles/globals.css'
import { useRouter } from 'next/router'
import { UnlockProvider } from '../unlock-react/useUnlock'

function MyApp({ Component, pageProps }) {
  const router = useRouter()
  return <UnlockProvider path={router.asPath} push={router.push}>
    <Component {...pageProps} />
  </UnlockProvider>
}

export default MyApp
