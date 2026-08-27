export type LongConsistencyIdentityMismatchScope = 'verifier' | 'adjudicator'

export const LONG_CONSISTENCY_IDENTITY_MISMATCH_CODE = 'long_consistency_identity_mismatch'

export class LongConsistencyIdentityMismatchError extends Error {
  readonly code = LONG_CONSISTENCY_IDENTITY_MISMATCH_CODE
  readonly scope: LongConsistencyIdentityMismatchScope

  constructor(scope: LongConsistencyIdentityMismatchScope) {
    super(`${LONG_CONSISTENCY_IDENTITY_MISMATCH_CODE}:${scope}`)
    this.name = 'LongConsistencyIdentityMismatchError'
    this.scope = scope
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export function isLongConsistencyIdentityMismatchError(
  value: unknown,
): value is LongConsistencyIdentityMismatchError {
  return value instanceof LongConsistencyIdentityMismatchError
    || (
      value != null
      && typeof value === 'object'
      && (value as { code?: unknown }).code === LONG_CONSISTENCY_IDENTITY_MISMATCH_CODE
      && ((value as { scope?: unknown }).scope === 'verifier'
        || (value as { scope?: unknown }).scope === 'adjudicator')
    )
}
