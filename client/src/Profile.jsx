import { useEffect, useRef, useState } from 'react'
import { api } from './api.js'
export default function Profile({ user, onSave, onClose }) {
  const dialog = useRef(null)
  const displayNameInput = useRef(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const previous = document.activeElement
    const node = dialog.current
    node.showModal()
    displayNameInput.current?.focus()
    return () => {
      node.close()
      previous?.focus()
    }
  }, [])
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const { user } = await api('/profile', {
        method: 'PATCH',
        body: Object.fromEntries(new FormData(event.currentTarget)),
      })
      onSave(user)
      onClose()
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <dialog ref={dialog} onCancel={onClose} aria-labelledby="profile-title">
      <div className="section-heading">
        <h2 id="profile-title">Your profile</h2>
        <button onClick={onClose} aria-label="Close profile">
          ×
        </button>
      </div>
      <p>@{user.username} · Your username stays yours.</p>
      <form onSubmit={submit}>
        <label>
          Display name
          <input
            ref={displayNameInput}
            name="displayName"
            defaultValue={user.displayName}
            required
            maxLength={50}
            autoFocus
          />
        </label>
        <label>
          Bio
          <textarea
            name="bio"
            defaultValue={user.bio}
            maxLength={160}
            rows={3}
          />
        </label>
        <small>
          Your name, username, and bio are visible to other members.
        </small>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </dialog>
  )
}
