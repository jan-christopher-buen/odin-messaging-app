import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { useState } from 'react'
import Chat from './Chat.jsx'
import { api } from './api.js'
vi.mock('./api.js', () => ({ api: vi.fn() }))
const user = { id: 1, displayName: 'Alice' }
const conversation = {
  id: 4,
  other: { id: 2, displayName: 'Bob', username: 'bob', bio: 'Hello' },
}
function Harness() {
  const [draft, setDraft] = useState('A thought')
  return (
    <Chat
      conversation={conversation}
      user={user}
      draft={draft}
      onDraft={setDraft}
      onBack={() => {}}
      onActivity={() => {}}
    />
  )
}
beforeEach(() => {
  api.mockReset()
})
test('refresh preserves draft and text is rendered safely', async () => {
  api.mockResolvedValue({
    messages: [
      {
        id: 1,
        senderId: 2,
        text: '<script>bad()</script>\nHello',
        createdAt: '2026-01-01T12:00:00Z',
      },
    ],
    hasOlder: false,
  })
  const { container } = render(<Harness />)
  await screen.findByText(/<script>bad/)
  expect(container.querySelector('script')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Refresh/ }))
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2))
  expect(screen.getByLabelText('Message')).toHaveValue('A thought')
})
test('keeps failed draft, prevents pending duplicates, clears only after confirmed send', async () => {
  api
    .mockResolvedValueOnce({ messages: [], hasOlder: false })
    .mockRejectedValueOnce(new Error('Network unavailable'))
  render(<Harness />)
  await screen.findByText(/Every connection/)
  fireEvent.click(screen.getByRole('button', { name: 'Send ↗' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('Message')).toHaveValue('A thought')
  let resolve
  api.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Send ↗' }))
  expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled()
  expect(screen.queryByText('A thought', { selector: 'p' })).toBeNull()
  resolve({
    message: {
      id: 2,
      senderId: 1,
      text: 'A thought',
      createdAt: new Date().toISOString(),
    },
  })
  await waitFor(() => expect(screen.getByLabelText('Message')).toHaveValue(''))
  expect(screen.getByText('A thought')).toBeInTheDocument()
})
test('late requests cannot replace a newly selected conversation', async () => {
  let resolve
  api
    .mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    .mockResolvedValueOnce({ messages: [], hasOlder: false })
  const props = {
    user,
    draft: '',
    onDraft: vi.fn(),
    onBack: vi.fn(),
    onActivity: vi.fn(),
  }
  const { rerender } = render(
    <Chat key={4} conversation={conversation} {...props} />,
  )
  rerender(
    <Chat
      key={5}
      conversation={{
        ...conversation,
        id: 5,
        other: { ...conversation.other, displayName: 'Eve' },
      }}
      {...props}
    />,
  )
  await screen.findByText(/Send your first message to Eve/)
  resolve({
    messages: [
      {
        id: 1,
        senderId: 2,
        text: 'Old private text',
        createdAt: new Date().toISOString(),
      },
    ],
    hasOlder: false,
  })
  await waitFor(() => expect(screen.queryByText('Old private text')).toBeNull())
})
