import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/base/global.css'
import App from './App.tsx'

// Links and bookmarks from before clean URLs (/#/reviewer/...) open the same page at its new address.
if (window.location.hash.startsWith('#/')) {
  window.history.replaceState(null, '', window.location.hash.slice(1))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
