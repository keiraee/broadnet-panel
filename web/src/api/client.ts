import type { AccountSnapshot, AuthState } from '../types'

const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function getCaptcha() {
  return request<{ image?: string; code?: string; hint: string }>('/auth/captcha')
}

export function sendSms(phone: string, captcha: string) {
  return request<{ ok: boolean; message: string }>('/auth/sms', {
    method: 'POST',
    body: JSON.stringify({ phone, captcha }),
  })
}

export function login(phone: string, smsCode: string, captcha: string) {
  return request<{ ok: boolean; phone: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phone, smsCode, captcha }),
  })
}

export function getSession() {
  return request<AuthState & { gateway?: Record<string, unknown> }>('/auth/session')
}

export function getAccount() {
  return request<AccountSnapshot & { stale?: boolean; error?: string }>('/account')
}

export function refreshAccount() {
  return request<AccountSnapshot>('/account/refresh', { method: 'POST' })
}
