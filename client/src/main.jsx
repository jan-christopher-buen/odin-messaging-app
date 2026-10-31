import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {window.location.pathname === '/' ? (
      <App />
    ) : (
      <main className="boot">
        <h1>That page isn’t here.</h1>
        <p>The conversation starts at your inbox.</p>
        <a href="/">Return to Signal Post</a>
      </main>
    )}
  </React.StrictMode>,
)
