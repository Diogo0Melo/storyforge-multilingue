import { describe, expect, it, vi } from 'vitest'
import { adoptMasterCandidate, type MasterCandidatePayload } from '../../src/lib/agent/orchestrator'
import { db } from '../../src/lib/db/schema'
import { projectAgentShadowFields, projectCodexShadowFields, projectReverseShadowFields } from '../../src/lib/ai/language-shadow-projections'
import { runLanguageShadow } from '../../src/lib/ai/language-shadow-runner'
import type { AgentEvent } from '../../src/lib/types'

describe('R-I18N-P5 shadow adoption boundaries', () => {
  it('keeps Codex, Reverse and Agents confirmation boundaries non-blocking', () => {
    const adopt = vi.fn((_input: unknown) => ({ written: ['candidate'] }))
    const saveVersion = vi.fn((_input: unknown) => ({ saved: true }))
    const signal = { role: 'free-text' as const, value: 'The ancient kingdom was guarded by a silent order with a long history.' }
    const reports = [
      runLanguageShadow({ family: 'codex', targetLanguage: 'pt-BR', fields: projectCodexShadowFields([{ summary: signal.value }]) }),
      runLanguageShadow({ family: 'reverse', targetLanguage: 'pt-BR', fields: projectReverseShadowFields({
        worldview: { worldOrigin: signal.value, powerHierarchy: '', continentLayout: '', climateByRegion: '', historyLine: '', races: '', factionLayout: '' },
        storyCore: { logline: '', theme: '', centralConflict: '', plotPattern: '', mainPlot: '' },
        characters: [],
      }) }),
      runLanguageShadow({ family: 'agents', targetLanguage: 'pt-BR', fields: projectAgentShadowFields([signal]) }),
    ]
    expect(reports.every(report => report.status === 'signal')).toBe(true)
    expect(adopt({ reports })).toEqual({ written: ['candidate'] })
    expect(saveVersion({ reports })).toEqual({ saved: true })
    expect(adopt).toHaveBeenCalledOnce()
    expect(saveVersion).toHaveBeenCalledOnce()
  })

  it('swallows observer failures and never turns a signal into a gate issue or retry', () => {
    const observer = vi.fn(() => { throw new Error('sensitive provider detail') })
    const report = runLanguageShadow({
      family: 'agents',
      targetLanguage: 'pt-BR',
      fields: [{ role: 'free-text', value: 'The ancient kingdom was guarded by a silent order with a long history.' }],
    }, observer)
    expect(report.status).toBe('signal')
    expect(report.codes).toMatchObject({ possibleNonTargetLanguage: 1, validatorError: 1 })
    expect(JSON.stringify(report)).not.toContain('sensitive provider detail')
    expect(report).not.toHaveProperty('issues')
    expect(report).not.toHaveProperty('retry')
    expect(report).not.toHaveProperty('gate')
  })

  it('adopts through a runtime node when the shadow DB project read fails open', async () => {
    const nodeAdopt = vi.fn(async (output: string) => ({ output }))
    const payload: MasterCandidatePayload = {
      version: 1,
      taskId: 'world-origin-1',
      agentId: 'world-origin',
      label: 'World origin',
      contextSources: [],
      baseSnapshot: {},
    }
    const event: AgentEvent = {
      projectId: 99001,
      conversationId: 99001,
      sequence: 1,
      kind: 'candidate',
      content: 'A candidate world origin.',
      payload: JSON.stringify(payload),
      createdAt: Date.now(),
    }
    const runtime = {
      payload,
      draft: 'A candidate world origin.',
      runtimeNode: {
        id: 'test-world-origin',
        kind: 'world-origin',
        editableInput: true,
        assembleInput: () => [{ role: 'user' as const, content: 'A candidate world origin.' }],
        run: async () => 'A candidate world origin.',
        adopt: nodeAdopt,
      },
      runtimeOutput: 'A candidate world origin.',
    }

    vi.spyOn(db.projects, 'get').mockRejectedValueOnce(new Error('shadow DB unavailable'))
    await expect(adoptMasterCandidate({
      projectId: event.projectId,
      worldGroupId: null,
      event,
      payload,
      draft: runtime.draft,
      runtime,
    })).resolves.toBeTruthy()
    expect(nodeAdopt).toHaveBeenCalledOnce()
  })
})
