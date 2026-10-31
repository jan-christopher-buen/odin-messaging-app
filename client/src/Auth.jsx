import { useState } from 'react'
import { api } from './api.js'
export default function Auth({ onLogin }) {
  const [signup, setSignup] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await api(signup ? '/signup' : '/login', {
        method: 'POST',
        body: Object.fromEntries(new FormData(event.currentTarget)),
      })
      onLogin(result.user)
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="auth">
      <section className="intro">
        <a className="brand" href="/">
          ◉ SIGNAL POST
        </a>
        <div>
          <span className="eyebrow">LESS NOISE. MORE CONNECTION.</span>
          <h1>
            A little
            <br />
            closer.
          </h1>
          <p>
            A thoughtful space for your everyday conversations.
            <br />
            Find your people. Pick up where you left off.
          </p>
        </div>
        <small>Private conversations. A refresh away.</small>
      </section>
      <section className="auth-form">
        <span className="eyebrow">YOUR NEXT CONVERSATION STARTS HERE</span>
        <h2>{signup ? 'Make yourself at home.' : 'Good to see you.'}</h2>
        <p>
          {signup
            ? 'Create an account to say hello.'
            : 'Log in and pick up the conversation.'}
        </p>
        <form onSubmit={submit}>
          <label>
            Username
            <input
              name="username"
              autoComplete="username"
              required
              minLength={signup ? 3 : 1}
              maxLength={24}
              pattern={signup ? '[A-Za-z0-9_]+' : undefined}
            />
          </label>
          {signup && (
            <label>
              Display name
              <input
                name="displayName"
                autoComplete="nickname"
                required
                maxLength={50}
              />
            </label>
          )}
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={signup ? 'new-password' : 'current-password'}
              required
              minLength={signup ? 10 : 1}
            />
          </label>
          {signup && (
            <>
              <small>At least 10 characters; at most 72 UTF-8 bytes.</small>
              <label>
                Confirm password
                <input
                  name="passwordConfirmation"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </label>
            </>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? 'One moment…' : signup ? 'Create account →' : 'Log in →'}
          </button>
        </form>
        <p>
          {signup ? 'Already have an account?' : 'New around here?'}{' '}
          <button
            className="text-button"
            onClick={() => {
              setSignup(!signup)
              setError('')
            }}
          >
            {signup ? 'Log in' : 'Create an account'}
          </button>
        </p>
      </section>
    </main>
  )
}
