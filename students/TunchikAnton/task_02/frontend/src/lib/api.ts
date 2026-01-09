import { getToken } from './storage'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export class ApiError extends Error {
  status: number
  details: any
  constructor(status: number, message: string, details?: any) {
    super(message)
    this.status = status
    this.details = details
  }
}

export async function apiFetch<T>(
  path: string,
  opts: RequestInit & { json?: any } = {},
): Promise<T> {
  const headers = new Headers(opts.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  if (opts.json !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
  })

  const contentType = res.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')
  const data = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null)

  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) ? (data.detail || data.message) : res.statusText
    throw new ApiError(res.status, msg, data)
  }
  return data as T
}

export function apiUrl(path: string): string {
  return `${API_URL}${path}`
}
