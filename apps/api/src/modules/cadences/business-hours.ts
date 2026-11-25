import type { BusinessDay, BusinessHours } from '@crm/shared'

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo'

const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_LOOKAHEAD_DAYS = 366

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone)

  if (cached) {
    return cached
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  formatters.set(timeZone, formatter)

  return formatter
}

function assertValidDate(date: Date): void {
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('Data inválida')
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function parseTimeOfDay(value: string): number {
  const match = TIME_OF_DAY_PATTERN.exec(value)

  if (!match) {
    throw new RangeError(`Horário inválido: ${value}`)
  }

  return Number(match[1]) * 60 + Number(match[2])
}

export interface ZonedDateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekday: number
  dateKey: string
}

export function getZonedDateParts(date: Date, timeZone = DEFAULT_TIMEZONE): ZonedDateParts {
  assertValidDate(date)

  let year = 0
  let month = 0
  let day = 0
  let hour = 0
  let minute = 0
  let second = 0

  for (const part of formatterFor(timeZone).formatToParts(date)) {
    switch (part.type) {
      case 'year':
        year = Number(part.value)
        break
      case 'month':
        month = Number(part.value)
        break
      case 'day':
        day = Number(part.value)
        break
      case 'hour':
        hour = Number(part.value)
        break
      case 'minute':
        minute = Number(part.value)
        break
      case 'second':
        second = Number(part.value)
        break
      default:
        break
    }
  }

  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday,
    dateKey: `${year}-${pad(month)}-${pad(day)}`,
  }
}

export function formatZonedDateKey(date: Date, timeZone = DEFAULT_TIMEZONE): string {
  return getZonedDateParts(date, timeZone).dateKey
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedDateParts(date, timeZone)
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  const truncated = date.getTime() - (date.getTime() % 1000)

  return asUtc - truncated
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const wallClock = Date.UTC(year, month - 1, day, hour, minute)
  const firstOffset = timeZoneOffsetMs(new Date(wallClock), timeZone)
  const firstCandidate = wallClock - firstOffset
  const secondOffset = timeZoneOffsetMs(new Date(firstCandidate), timeZone)

  return new Date(secondOffset === firstOffset ? firstCandidate : wallClock - secondOffset)
}

function findBusinessDay(hours: BusinessHours, weekday: number): BusinessDay | undefined {
  return hours.days.find((day) => day.weekday === weekday)
}

export function isHoliday(date: Date, hours: BusinessHours, timeZone = DEFAULT_TIMEZONE): boolean {
  return hours.holidays.includes(formatZonedDateKey(date, timeZone))
}

export function isBusinessDay(
  date: Date,
  hours: BusinessHours,
  timeZone = DEFAULT_TIMEZONE,
): boolean {
  const parts = getZonedDateParts(date, timeZone)
  const day = findBusinessDay(hours, parts.weekday)

  if (!day?.enabled) {
    return false
  }

  return !hours.holidays.includes(parts.dateKey)
}

export function isWithinBusinessHours(
  date: Date,
  hours: BusinessHours,
  timeZone = DEFAULT_TIMEZONE,
): boolean {
  const parts = getZonedDateParts(date, timeZone)
  const day = findBusinessDay(hours, parts.weekday)

  if (!day?.enabled) {
    return false
  }

  if (hours.holidays.includes(parts.dateKey)) {
    return false
  }

  const currentMinute = parts.hour * 60 + parts.minute
  const startMinute = parseTimeOfDay(day.start)
  const endMinute = parseTimeOfDay(day.end)

  return currentMinute >= startMinute && currentMinute < endMinute
}

export function nextAllowedTime(
  date: Date,
  hours: BusinessHours,
  timeZone = DEFAULT_TIMEZONE,
): Date {
  assertValidDate(date)

  if (isWithinBusinessHours(date, hours, timeZone)) {
    return new Date(date.getTime())
  }

  for (let offset = 0; offset <= MAX_LOOKAHEAD_DAYS; offset += 1) {
    const probe = new Date(date.getTime() + offset * DAY_MS)
    const parts = getZonedDateParts(probe, timeZone)
    const day = findBusinessDay(hours, parts.weekday)

    if (!day?.enabled || hours.holidays.includes(parts.dateKey)) {
      continue
    }

    const startMinute = parseTimeOfDay(day.start)
    const endMinute = parseTimeOfDay(day.end)
    const open = zonedDateTimeToUtc(
      parts.year,
      parts.month,
      parts.day,
      Math.floor(startMinute / 60),
      startMinute % 60,
      timeZone,
    )
    const close = zonedDateTimeToUtc(
      parts.year,
      parts.month,
      parts.day,
      Math.floor(endMinute / 60),
      endMinute % 60,
      timeZone,
    )

    if (open.getTime() > date.getTime()) {
      return open
    }

    if (date.getTime() < close.getTime()) {
      return new Date(date.getTime())
    }
  }

  throw new RangeError(`Nenhum horário disponível em ${MAX_LOOKAHEAD_DAYS} dias`)
}
