import { createHash, randomBytes } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'

const HASH_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, HASH_OPTIONS)
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
