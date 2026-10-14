import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/base/global.css'
import App from './App.tsx'
import { applyTheme, readTheme } from './state/theme'

// The theme (dark unless the person chose light), applied before the first paint. index.html
// already starts dark, so only a light choice changes anything here.
applyTheme(readTheme())

// Links and bookmarks from before clean URLs (/#/reviewer/...) open the same page at its new address.
if (window.location.hash.startsWith('#/')) {
  window.history.replaceState(null, '', window.location.hash.slice(1))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
