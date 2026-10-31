let csrfToken
export async function api(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    signal,
    credentials: 'same-origin',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'X-CSRF-Token': csrfToken || '' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = response.status === 204 ? {} : await response.json()
  if (!response.ok) {
    if (response.status === 401 && path !== '/login')
      window.dispatchEvent(new Event('session-expired'))
    throw new Error(data.error || 'Request failed.')
  }
  if (data.csrfToken) csrfToken = data.csrfToken
  return data
}
export function clearToken() {
  csrfToken = undefined
}
