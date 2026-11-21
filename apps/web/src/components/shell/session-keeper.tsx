'use client'

import { useEffect } from 'react'

const REFRESH_INTERVAL_MS = 10 * 60 * 1000

export function SessionKeeper() {
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetch('/api/backend/v1/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        })
      }
    }, REFRESH_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [])

  return null
}
