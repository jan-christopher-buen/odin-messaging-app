import { useCallback, useEffect, useRef, useState } from 'react'
import { api, clearToken } from './api.js'
import Auth from './Auth.jsx'
import Profile from './Profile.jsx'
import Chat, { Avatar } from './Chat.jsx'
export default function App() {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [bootError, setBootError] = useState('')
  const [conversations, setConversations] = useState(null)
  const [selected, setSelected] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [profile, setProfile] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [sendPending, setSendPending] = useState(false)
  const [error, setError] = useState('')
  const version = useRef(0)
  const listHeading = useRef(null)
  const reset = useCallback(() => {
    version.current++
    setUser(null)
    setReady(false)
    setConversations(null)
    setSelected(null)
    setDrafts({})
    setProfile(false)
    setResults(null)
    setQuery('')
    setError('')
    setBusy(false)
    setSendPending(false)
    clearToken()
  }, [])
  const restore = useCallback(async () => {
    setBootError('')
    try {
      const data = await api('/session')
      setUser(data.user)
      setReady(true)
    } catch (error) {
      setBootError(error.message)
    }
  }, [])
  useEffect(() => {
    let alive = true
    api('/session')
      .then((data) => {
        if (alive) {
          setUser(data.user)
          setReady(true)
        }
      })
      .catch((error) => {
        if (alive) setBootError(error.message)
      })
    return () => {
      alive = false
    }
  }, [])
  useEffect(() => {
    const expired = () => {
      reset()
      restore()
    }
    window.addEventListener('session-expired', expired)
    return () => window.removeEventListener('session-expired', expired)
  }, [reset, restore])
  const refresh = useCallback(async () => {
    const generation = version.current
    try {
      const data = await api('/conversations')
      if (generation === version.current) setConversations(data.conversations)
    } catch (error) {
      if (generation === version.current) setError(error.message)
    }
  }, [])
  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    const generation = version.current
    api('/conversations', { signal: controller.signal })
      .then((data) => {
        if (generation === version.current) setConversations(data.conversations)
      })
      .catch((error) => {
        if (error.name !== 'AbortError' && generation === version.current)
          setError(error.message)
      })
    return () => controller.abort()
  }, [user])
  async function search(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const generation = version.current
    try {
      const data = await api(`/users?q=${encodeURIComponent(query)}`)
      if (generation === version.current) setResults(data.users)
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }
  async function start(other) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const { id } = await api('/conversations', {
        method: 'POST',
        body: { userId: other.id },
      })
      await refresh()
      setSelected({ id, other })
      setResults(null)
      setQuery('')
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }
  async function logout() {
    setBusy(true)
    try {
      await api('/logout', { method: 'POST' })
      reset()
      await restore()
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }
  if (bootError)
    return (
      <main className="boot">
        <h1>Unable to connect</h1>
        <p role="alert">{bootError}</p>
        <button onClick={restore}>Try again</button>
      </main>
    )
  if (!ready) return <main className="boot">Opening Signal Post…</main>
  if (!user) return <Auth onLogin={setUser} />
  return (
    <main className={`workspace ${selected ? 'has-selection' : ''}`}>
      <aside className="sidebar">
        <header className="sidebar-top">
          <a className="brand" href="/">
            ◉ SIGNAL POST
          </a>
          <span className="edition">A LITTLE CLOSER</span>
        </header>
        <div className="inbox-tools">
          <div className="section-heading">
            <h1 ref={listHeading} tabIndex={-1}>
              Conversations
              <span>
                {(conversations?.length || 0).toString().padStart(2, '0')}
              </span>
            </h1>
            <button aria-label="Refresh conversations" onClick={refresh}>
              ↻
            </button>
          </div>
          <label className="search-label" htmlFor="search">
            Find a username
          </label>
          <form onSubmit={search} className="search">
            <input
              id="search"
              placeholder="Find someone by username"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={24}
              required
            />
            <button disabled={busy || sendPending} aria-label="Search users">
              ↗
            </button>
          </form>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <nav className="conversation-list" aria-label="Conversations">
          {results !== null ? (
            <>
              <div className="search-heading">
                <span>PEOPLE</span>
                <button onClick={() => setResults(null)}>Done</button>
              </div>
              {results.length === 0 && (
                <p className="muted">No usernames found. Try another search.</p>
              )}
              {results.map((other) => (
                <button
                  className="conversation"
                  key={other.id}
                  onClick={() => start(other)}
                  disabled={busy || sendPending}
                >
                  <Avatar user={other} />
                  <span className="person">
                    <strong>{other.displayName}</strong>
                    <span>@{other.username}</span>
                  </span>
                  <span>＋</span>
                </button>
              ))}
            </>
          ) : conversations === null ? (
            <p className="muted" role="status">
              {error
                ? 'Use refresh to try loading your conversations again.'
                : 'Loading conversations…'}
            </p>
          ) : conversations.length ? (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={`conversation ${selected?.id === conversation.id ? 'selected' : ''}`}
                aria-pressed={selected?.id === conversation.id}
                disabled={sendPending}
                onClick={() => setSelected(conversation)}
              >
                <Avatar user={conversation.other} />
                <span className="person">
                  <strong>{conversation.other.displayName}</strong>
                  <span>
                    {conversation.latest?.text || 'Say the first hello'}
                  </span>
                </span>
                {conversation.latest && (
                  <time>
                    {new Date(conversation.latest.createdAt).toLocaleDateString(
                      [],
                      { month: 'short', day: 'numeric' },
                    )}
                  </time>
                )}
              </button>
            ))
          ) : (
            <div className="list-empty">
              <span>✳</span>
              <h3>Your people, right here.</h3>
              <p>
                Search for a username above
                <br />
                to start a conversation.
              </p>
            </div>
          )}
        </nav>
        <footer className="account">
          <button className="profile-button" onClick={() => setProfile(true)}>
            <Avatar user={user} />
            <span className="person">
              <strong>{user.displayName}</strong>
              <span>Edit your profile</span>
            </span>
          </button>
          <button
            onClick={logout}
            disabled={busy || sendPending}
            aria-label="Log out"
          >
            ↪
          </button>
        </footer>
      </aside>
      {selected ? (
        <Chat
          key={selected.id}
          conversation={selected}
          user={user}
          draft={drafts[selected.id] || ''}
          onDraft={(value) =>
            setDrafts((previous) => ({ ...previous, [selected.id]: value }))
          }
          onBack={() => {
            setSelected(null)
            requestAnimationFrame(() => listHeading.current?.focus())
          }}
          onActivity={refresh}
          onPending={setSendPending}
        />
      ) : (
        <section className="welcome">
          <span className="eyebrow">MAKE SPACE FOR A GOOD CONVERSATION</span>
          <div className="postmark">
            ↗
            <span>
              HELLO
              <br />
              THERE.
            </span>
          </div>
          <h2>
            Small messages.
            <br />
            Meaningful connections.
          </h2>
          <p>
            Choose a conversation or find someone new.
            <br />
            There’s always something worth sharing.
          </p>
          <span className="welcome-foot">
            PRIVATE BY DESIGN · REFRESH AT YOUR PACE
          </span>
        </section>
      )}
      {profile && (
        <Profile
          user={user}
          onSave={setUser}
          onClose={() => setProfile(false)}
        />
      )}
    </main>
  )
}
