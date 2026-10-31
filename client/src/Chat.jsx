import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from './api.js'
export function Avatar({ user }) {
  return (
    <span className="avatar" aria-hidden="true">
      {user.displayName
        .trim()
        .split(/\s+/)
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()}
    </span>
  )
}
export default function Chat({
  conversation,
  user,
  draft,
  onDraft,
  onBack,
  onActivity,
  onPending = () => {},
}) {
  const [messages, setMessages] = useState([])
  const [hasOlder, setHasOlder] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const scroller = useRef(null)
  const heading = useRef(null)
  const position = useRef(null)
  const active = useRef(true)
  const request = useRef(0)
  const sendLock = useRef(false)
  const other = conversation.other
  useEffect(() => {
    active.current = true
    const controller = new AbortController()
    const generation = ++request.current
    heading.current?.focus()
    api(`/conversations/${conversation.id}/messages`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (generation === request.current) {
          setMessages(data.messages)
          setHasOlder(data.hasOlder)
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setError(error.message)
      })
      .finally(() => {
        if (active.current && generation === request.current) setLoading(false)
      })
    return () => {
      active.current = false
      controller.abort()
    }
  }, [conversation.id])
  useLayoutEffect(() => {
    const node = scroller.current
    if (position.current !== null) {
      const anchor = node.querySelector(
        `[data-message-id="${position.current.id}"]`,
      )
      if (anchor)
        node.scrollTop +=
          anchor.getBoundingClientRect().top - position.current.top
      position.current = null
    } else node.scrollTop = node.scrollHeight
  }, [messages])
  async function load(older = false) {
    if (loading) return
    setLoading(true)
    setError('')
    const generation = ++request.current
    try {
      const data = await api(
        `/conversations/${conversation.id}/messages${older ? `?before=${messages[0].id}` : ''}`,
      )
      if (!active.current || generation !== request.current) return
      if (older) {
        const anchor = scroller.current.querySelector('article.message')
        if (anchor)
          position.current = {
            id: anchor.dataset.messageId,
            top: anchor.getBoundingClientRect().top,
          }
      }
      setMessages((previous) =>
        older ? [...data.messages, ...previous] : data.messages,
      )
      setHasOlder(data.hasOlder)
      setNotice(older ? 'Older messages loaded.' : 'Messages refreshed.')
      onActivity()
    } catch (error) {
      if (active.current) setError(error.message)
    } finally {
      if (active.current) setLoading(false)
    }
  }
  async function send(event) {
    event.preventDefault()
    if (sendLock.current || loading || !draft.trim()) return
    sendLock.current = true
    setSending(true)
    onPending(true)
    setError('')
    try {
      const { message } = await api(
        `/conversations/${conversation.id}/messages`,
        { method: 'POST', body: { text: draft } },
      )
      if (!active.current) return
      setMessages((previous) => [
        ...previous.filter((item) => item.id !== message.id),
        message,
      ])
      onDraft('')
      setNotice('Message sent.')
      onActivity()
    } catch (error) {
      if (active.current) setError(error.message)
    } finally {
      sendLock.current = false
      if (active.current) onPending(false)
      if (active.current) setSending(false)
    }
  }
  return (
    <section
      className="chat"
      aria-label={`Conversation with ${other.displayName}`}
    >
      <header className="chat-header">
        <button
          className="mobile-back"
          onClick={onBack}
          disabled={sending}
          aria-label="Back to conversations"
        >
          ←
        </button>
        <Avatar user={other} />
        <div className="person">
          <h2 ref={heading} tabIndex={-1}>
            {other.displayName}
          </h2>
          <span>@{other.username}</span>
        </div>
        <button onClick={() => load()} disabled={loading || sending}>
          ↻ Refresh
        </button>
      </header>
      <div className="chat-note">
        A slower, more thoughtful inbox. Refresh to see new messages.
      </div>
      {other.bio && <p className="bio">{other.bio}</p>}
      <div ref={scroller} className="messages" aria-busy={loading}>
        {hasOlder && (
          <button
            className="older"
            onClick={() => load(true)}
            disabled={loading || sending}
          >
            Load older messages
          </button>
        )}
        {loading && messages.length === 0 && (
          <p className="muted">Loading conversation…</p>
        )}
        {!loading && messages.length === 0 && (
          <div className="chat-empty">
            <span>↗</span>
            <h3>
              Every connection starts
              <br />
              with a hello.
            </h3>
            <p>Send your first message to {other.displayName}.</p>
          </div>
        )}
        {messages.map((message, index) => {
          const outgoing = message.senderId === user.id
          const grouped =
            index > 0 && messages[index - 1].senderId === message.senderId
          return (
            <article
              key={message.id}
              data-message-id={message.id}
              className={`message ${outgoing ? 'outgoing' : 'incoming'} ${grouped ? 'grouped' : ''}`}
            >
              {!grouped && (
                <span className="sender">
                  {outgoing ? 'You' : other.displayName}
                </span>
              )}
              <p>{message.text}</p>
              <time dateTime={message.createdAt}>
                {new Date(message.createdAt).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </article>
          )
        })}
      </div>
      <div className="composer-wrap">
        {error && (
          <p role="alert" className="error">
            {error} Your draft is kept; try again.
          </p>
        )}
        <span className="sr-only" role="status">
          {notice}
        </span>
        <label className="composer-label" htmlFor="message">
          Message
        </label>
        <form className="composer" onSubmit={send}>
          <textarea
            id="message"
            placeholder="Put a thought into words…"
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            maxLength={4000}
            rows={2}
            disabled={sending}
          />
          <button
            className="primary"
            disabled={sending || loading || !draft.trim()}
          >
            {sending ? 'Sending…' : 'Send ↗'}
          </button>
        </form>
        <small>
          {draft.length}/4000 · Text only. A little room to be yourself.
        </small>
      </div>
    </section>
  )
}
