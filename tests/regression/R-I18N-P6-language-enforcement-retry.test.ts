import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GenerationNode } from '../../src/lib/generation/generation-node'
import { prepareGenerationNode } from '../../src/lib/generation/generation-node'
import { validateLanguage } from '../../src/lib/ai/language-shadow-enforcement'
import { adoptMasterCandidate, type MasterCandidatePayload } from '../../src/lib/agent/orchestrator'
import { AgentTeamBudgetTracker } from '../../src/lib/agent/team-budget'
import { runBudgetedGenerationNode } from '../../src/lib/agent/team-execution'
import { db } from '../../src/lib/db/schema'
import type { AgentEvent } from '../../src/lib/types'

const bad = 'The ancient kingdom was guarded by a silent order with a long history.'
const good = 'O reino antigo era protegido por uma ordem silenciosa com uma longa história.'

function language(mode: 'shadow' | 'enforce') {
  return {
    family: 'agents' as const,
    targetLanguage: 'pt-BR' as const,
    mode,
    project: (output: string) => [{ role: 'free-text' as const, value: output }],
  }
}

function node(run: GenerationNode<string, string>['run']): GenerationNode<string, string> {
  return {
    id: 'p6-test', kind: 'test', editableInput: true,
    assembleInput: input => [{ role: 'user', content: input }], run,
  }
}

describe('R-I18N-P6 language enforcement and shared retry', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(() => db.close())

  it('keeps default shadow advisory without a second provider call', async () => {
    const run = vi.fn().mockResolvedValue(bad)
    await runBudgetedGenerationNode({
      node: node(run), prepared: prepareGenerationNode(node(run), 'candidate'),
      budget: new AgentTeamBudgetTracker('balanced'), callLabel: 'Agent', maxOutputTokens: 100,
      languageShadow: language('shadow'),
    })
    expect(run).toHaveBeenCalledOnce()
  })

  it('retries an enforce signal once and returns the complete accepted candidate', async () => {
    const run = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(good)
    const result = await runBudgetedGenerationNode({
      node: node(run), prepared: prepareGenerationNode(node(run), 'candidate'),
      budget: new AgentTeamBudgetTracker('balanced'), callLabel: 'Agent', maxOutputTokens: 100,
      languageShadow: language('enforce'),
    })
    expect(result.output).toBe(good)
    expect(run).toHaveBeenCalledTimes(2)
    const retryMessages = run.mock.calls[1][0] as Array<{ content: string }>
    expect(retryMessages.at(-1)?.content).toContain('完整候选')
    expect(JSON.stringify(retryMessages)).not.toContain(bad)
  })

  it('does not expose a second invalid candidate or adopt it', async () => {
    const adopt = vi.fn()
    const run = vi.fn().mockResolvedValue(bad)
    await expect(runBudgetedGenerationNode({
      node: { ...node(run), adopt }, prepared: prepareGenerationNode(node(run), 'candidate'),
      budget: new AgentTeamBudgetTracker('balanced'), callLabel: 'Agent', maxOutputTokens: 100,
      languageShadow: language('enforce'),
    })).rejects.toThrow()
    expect(adopt).not.toHaveBeenCalled()
  })

  it('records one shared retry with both Canon and language causes', async () => {
    const run = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(good)
    const tracker = new AgentTeamBudgetTracker('balanced')
    await runBudgetedGenerationNode({
      node: node(run), prepared: prepareGenerationNode(node(run), 'candidate'), budget: tracker,
      callLabel: 'Agent', maxOutputTokens: 100,
      validate: output => output === bad ? [{ code: 'canon:test', message: 'canon issue' }] : [],
      languageShadow: language('enforce'),
    })
    expect(run).toHaveBeenCalledTimes(2)
    expect(tracker.snapshot()).toMatchObject({ semanticRetries: 1, retryCauses: ['canon', 'languageShadow'], calls: 2 })
  })

  it('never retries none or language-neutral outputs and enforces the one-retry budget', () => {
    expect(validateLanguage({
      family: 'agents', targetLanguage: 'pt-BR', mode: 'enforce', languagePolicy: 'none',
      fields: [{ role: 'free-text', value: bad }],
    })).toEqual([])
    const tracker = new AgentTeamBudgetTracker('balanced')
    tracker.claimRetry(['languageShadow'])
    expect(() => tracker.claimRetry(['generationGate'])).toThrow()
    expect(tracker.snapshot()).toMatchObject({ semanticRetries: 1, retryCauses: ['languageShadow'] })
  })

  it('revalidates an edited candidate through adoptMasterCandidate before adoption', async () => {
    const projectId = await db.projects.add({
      name: 'P6 enforcement',
      genre: 'fantasy',
      genres: ['fantasy'],
      status: 'drafting',
      description: '',
      targetWordCount: 10_000,
      enableMultiWorld: false,
      contentLanguage: 'pt-BR',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never) as number
    const provider = vi.fn().mockResolvedValue(good)
    const adopt = vi.fn().mockResolvedValue('adopted')
    const runtimeNode = node(provider)
    runtimeNode.adopt = adopt
    const payload: MasterCandidatePayload = {
      version: 1,
      taskId: 'world-origin-1',
      agentId: 'world-origin',
      label: 'World origin',
      contextSources: [],
      baseSnapshot: {},
    }
    const event: AgentEvent = {
      projectId,
      conversationId: 1,
      sequence: 1,
      kind: 'candidate',
      content: bad,
      payload: JSON.stringify(payload),
      createdAt: Date.now(),
    }

    await expect(adoptMasterCandidate({
      projectId,
      worldGroupId: null,
      event,
      payload,
      // The author edited the restored candidate after generation.
      draft: bad,
      runtime: {
        payload,
        draft: good,
        runtimeNode,
        runtimeOutput: good,
      },
      languageShadowPolicy: { agents: 'enforce' },
    })).rejects.toThrow('候选可能未遵循目标语言')

    expect(provider).not.toHaveBeenCalled()
    expect(adopt).not.toHaveBeenCalled()
    expect(await db.worldviews.count()).toBe(0)
  })
})
