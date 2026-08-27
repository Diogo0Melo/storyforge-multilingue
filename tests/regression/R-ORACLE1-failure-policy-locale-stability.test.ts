import { describe, expect, it } from 'vitest'
import {
  AgentRunFailureError,
  classifyAgentRunFailureV1,
  isAgentRunFailureError,
} from '../../src/lib/agent/run/failure-policy'

// Oracle remediation: durable failure evidence (classification + fingerprint)
// must be driven by stable internal codes, never by the localized display
// message. The same logical failure must hash identically regardless of the UI
// locale active when the error was thrown, while user-facing display stays
// translated (carried on `message` only).
describe('R-ORACLE1 · failure-policy locale-stable classification & fingerprints', () => {
  it('classifies a coded failure from its stable fields, ignoring the display message', async () => {
    const zh = await classifyAgentRunFailureV1(new AgentRunFailureError({
      code: 'post_adoption_stale_candidate',
      category: 'stale-input',
      action: 'replan',
      retryable: false,
      displayMessage: '正文已变化，候选已失效',
    }))
    const en = await classifyAgentRunFailureV1(new AgentRunFailureError({
      code: 'post_adoption_stale_candidate',
      category: 'stale-input',
      action: 'replan',
      retryable: false,
      displayMessage: 'Chapter content changed; candidate is stale',
    }))
    const pt = await classifyAgentRunFailureV1(new AgentRunFailureError({
      code: 'post_adoption_stale_candidate',
      category: 'stale-input',
      action: 'replan',
      retryable: false,
      displayMessage: 'Conteúdo do capítulo alterado; candidato obsoleto',
    }))

    for (const evidence of [zh, en, pt]) {
      expect(evidence).toMatchObject({
        code: 'post_adoption_stale_candidate',
        category: 'stale-input',
        action: 'replan',
        retryable: false,
      })
    }
  })

  it('produces an identical fingerprint for the same logical failure across locales', async () => {
    const zh = await classifyAgentRunFailureV1(new AgentRunFailureError({
      code: 'post_adoption_stale_candidate',
      category: 'stale-input',
      action: 'replan',
      retryable: false,
      displayMessage: '正文已变化，候选已失效',
    }))
    const en = await classifyAgentRunFailureV1(new AgentRunFailureError({
      code: 'post_adoption_stale_candidate',
      category: 'stale-input',
      action: 'replan',
      retryable: false,
      displayMessage: 'Chapter content changed; candidate is stale',
    }))
    const pt = await classifyAgentRunFailureV1(new AgentRunFailureError({
      code: 'post_adoption_stale_candidate',
      category: 'stale-input',
      action: 'replan',
      retryable: false,
      displayMessage: 'Conteúdo do capítulo alterado; candidato obsoleto',
    }))

    expect(en.fingerprint).toBe(zh.fingerprint)
    expect(pt.fingerprint).toBe(zh.fingerprint)
  })

  it('keeps distinct fingerprints for different stable failure codes', async () => {
    const stale = await classifyAgentRunFailureV1(new AgentRunFailureError({
      code: 'post_adoption_stale_candidate',
      category: 'stale-input',
      action: 'replan',
      retryable: false,
      displayMessage: 'stale',
    }))
    const notVisible = await classifyAgentRunFailureV1(new AgentRunFailureError({
      code: 'post_adoption_chapter_not_visible',
      category: 'deterministic',
      action: 'pause-for-author',
      retryable: false,
      displayMessage: 'stale', // same message, different code → different identity
    }))

    expect(notVisible.fingerprint).not.toBe(stale.fingerprint)
  })

  it('coded classification wins over message-based heuristics', async () => {
    // Message text would otherwise fall through to `execution_unknown`.
    const coded = await classifyAgentRunFailureV1(new AgentRunFailureError({
      code: 'post_adoption_chapter_not_visible',
      category: 'deterministic',
      action: 'pause-for-author',
      retryable: false,
      displayMessage: 'Capítulo não visível após a escrita',
    }))
    expect(coded).toMatchObject({
      code: 'post_adoption_chapter_not_visible',
      category: 'deterministic',
      action: 'pause-for-author',
      retryable: false,
    })
  })

  it('keeps the localized display message on the error for user-facing state', () => {
    const error = new AgentRunFailureError({
      code: 'post_adoption_stale_candidate',
      category: 'stale-input',
      action: 'replan',
      retryable: false,
      displayMessage: 'Conteúdo do capítulo alterado; candidato obsoleto',
    })
    expect(isAgentRunFailureError(error)).toBe(true)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('Conteúdo do capítulo alterado; candidato obsoleto')
  })

  it('preserves historical behavior for uncoded technical errors', async () => {
    const transient = await classifyAgentRunFailureV1(new Error('network timeout 12345'))
    const sameTransient = await classifyAgentRunFailureV1(new Error('network timeout 98765'))
    expect(transient).toMatchObject({ category: 'transient', action: 'retry', retryable: true })
    expect(sameTransient.fingerprint).toBe(transient.fingerprint)
  })
})
