import React from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server.js'
import { AuthProvider } from './lib/auth.jsx'
import App from './App.jsx'

export function render(pathname) {
  return renderToString(
    <React.StrictMode>
      <StaticRouter location={pathname}>
        <AuthProvider><App /></AuthProvider>
      </StaticRouter>
    </React.StrictMode>,
  )
}
