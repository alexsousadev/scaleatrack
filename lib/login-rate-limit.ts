const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 8

type Attempt = {
  count: number
  resetAt: number
}

const attempts = new Map<string, Attempt>()

export function loginRateLimitKey(headers: Headers) {
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

export function isLoginRateLimited(key: string, now = Date.now()) {
  const attempt = attempts.get(key)
  if (!attempt || attempt.resetAt <= now) return false

  return attempt.count >= MAX_ATTEMPTS
}

export function recordFailedLogin(key: string, now = Date.now()) {
  const attempt = attempts.get(key)
  if (!attempt || attempt.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return
  }

  attempt.count += 1
}

export function clearFailedLogins(key: string) {
  attempts.delete(key)
}
