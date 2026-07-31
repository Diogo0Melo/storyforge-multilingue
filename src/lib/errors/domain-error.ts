/**
 * Structured domain error for i18n migration.
 * Extends Error for backward compatibility; message is pre-translated at throw time.
 */
import i18n from '../../i18n/i18n'

export interface DomainErrorInit {
  code: string
  params?: Record<string, string | number>
  defaultMessage?: string
}

export class DomainError extends Error {
  public readonly code: string
  public readonly params: Record<string, string | number>

  constructor(init: DomainErrorInit) {
    const message = i18n.t(`errors:${init.code}` as any, init.params ?? {})
    super(message)
    this.name = 'DomainError'
    this.code = init.code
    this.params = init.params ?? {}
  }
}

/**
 * Type guard for DomainError
 */
export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError
}
