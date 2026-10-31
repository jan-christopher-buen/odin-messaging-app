import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import App from './App.jsx'
import { api } from './api.js'
vi.mock('./api.js', () => ({ api: vi.fn(), clearToken: vi.fn() }))
beforeEach(() => {
  api.mockReset()
})

test('logout removes private conversation and drafts before another login', async () => {
  let authenticated = true
  api.mockImplementation(async (path) => {
    if (path === '/session')
      return {
        user: authenticated
          ? { id: 1, displayName: 'Alice', username: 'alice' }
          : null,
      }
    if (path === '/conversations')
      return {
        conversations: [
          {
            id: 1,
            other: { id: 2, displayName: 'Bob', username: 'bob', bio: '' },
            latest: {
              text: 'Private preview',
              createdAt: new Date().toISOString(),
            },
          },
        ],
      }
    if (path.includes('/messages')) return { messages: [], hasOlder: false }
    if (path === '/logout') {
      authenticated = false
      return {}
    }
    return {}
  })
  render(<App />)
  fireEvent.click(await screen.findByText('Private preview'))
  await screen.findByText(/Every connection/)
  fireEvent.change(screen.getByLabelText('Message'), {
    target: { value: 'Secret draft' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByRole('button', { name: 'Log in →' })
  expect(screen.queryByText('Private preview')).toBeNull()
  expect(screen.queryByDisplayValue('Secret draft')).toBeNull()
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/logout', { method: 'POST' }),
  )
})

test('switching conversations preserves drafts and expired sessions clear them', async () => {
  let authenticated = true
  const conversations = [
    { id: 1, other: { id: 2, displayName: 'Bob', username: 'bob', bio: '' } },
    { id: 2, other: { id: 3, displayName: 'Eve', username: 'eve', bio: '' } },
  ]
  api.mockImplementation(async (path) => {
    if (path === '/session')
      return {
        user: authenticated
          ? { id: 1, displayName: 'Alice', username: 'alice' }
          : null,
      }
    if (path === '/conversations') return { conversations }
    if (path.includes('/messages')) return { messages: [], hasOlder: false }
    return {}
  })
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: /Bob/ }))
  await screen.findByText(/Send your first message to Bob/)
  fireEvent.change(screen.getByLabelText('Message'), {
    target: { value: 'A draft for Bob' },
  })
  fireEvent.click(screen.getByRole('button', { name: /Eve/ }))
  await screen.findByText(/Send your first message to Eve/)
  expect(screen.getByLabelText('Message')).toHaveValue('')
  fireEvent.click(screen.getByRole('button', { name: /Bob/ }))
  await screen.findByText(/Send your first message to Bob/)
  expect(screen.getByLabelText('Message')).toHaveValue('A draft for Bob')
  authenticated = false
  fireEvent(window, new Event('session-expired'))
  await screen.findByRole('button', { name: 'Log in →' })
  expect(screen.queryByDisplayValue('A draft for Bob')).toBeNull()
})

test('pending sends prevent navigation and a second submission', async () => {
  let resolveSend
  api.mockImplementation(async (path, options) => {
    if (path === '/session')
      return { user: { id: 1, displayName: 'Alice', username: 'alice' } }
    if (path === '/conversations')
      return {
        conversations: [
          {
            id: 1,
            other: { id: 2, displayName: 'Bob', username: 'bob', bio: '' },
          },
        ],
      }
    if (options?.method === 'POST')
      return new Promise((resolve) => {
        resolveSend = resolve
      })
    return { messages: [], hasOlder: false }
  })
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: /Bob/ }))
  await screen.findByText(/Send your first message to Bob/)
  fireEvent.change(screen.getByLabelText('Message'), {
    target: { value: 'One message' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send ↗' }))
  expect(
    screen.getByRole('button', { name: /Bob Say the first hello/ }),
  ).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Log out' })).toBeDisabled()
  fireEvent.submit(screen.getByLabelText('Message').closest('form'))
  expect(
    api.mock.calls.filter(([, options]) => options?.method === 'POST'),
  ).toHaveLength(1)
  resolveSend({
    message: {
      id: 10,
      senderId: 1,
      text: 'One message',
      createdAt: new Date().toISOString(),
    },
  })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Log out' })).toBeEnabled(),
  )
})
