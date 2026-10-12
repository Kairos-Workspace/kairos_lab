import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'react-toastify/dist/ReactToastify.css'
import { App } from './App'
import { initBrowserApi } from './lib/browserApi'
import './styles/global.css'

initBrowserApi()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
