/**
 * NS-5 · 语义检索(embedding)配置卡 — Labs。
 * 默认关闭=纯关键词检索(零额外成本/不外传)。开启后:配置 OpenAI 兼容 /embeddings 端点,
 * 并可为当前项目历史章节批量建立语义索引(幂等可续跑)。隐私首选本地 Ollama(手稿不出本机)。
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Loader2 } from 'lucide-react'
import { useAIConfigStore } from '../../stores/ai-config'
import { useProjectStore } from '../../stores/project'
import { ensureChunkEmbeddings, rebuildProjectNarrativeSummaries, rebuildProjectRetrievalChunks } from '../../lib/retrieval/retrieval'
import { isEmbeddingReady } from '../../lib/ai/adapters/embedding-adapter'
import type { EmbeddingConfig } from '../../lib/types'

// 本地代理 ↔ 直连 地址对（与聊天配置同套路：本地运行用代理绕 CORS，线上部署用直连）。
const PROXY_PAIRS: Array<{ proxy: string; direct: string }> = [
  { proxy: '/siliconflow-proxy/v1', direct: 'https://api.siliconflow.cn/v1' },
  { proxy: '/qwen-proxy/compatible-mode/v1', direct: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { proxy: '/glm-proxy/api/paas/v4', direct: 'https://open.bigmodel.cn/api/paas/v4' },
  { proxy: '/openai-proxy/v1', direct: 'https://api.openai.com/v1' },
]

// baseUrl 默认走本地代理路径（绕浏览器 CORS，本地运行工具时生效；线上部署需改直连且服务商允许跨域）。
type EmbeddingPresetKey = 'siliconflow' | 'qwen' | 'glm' | 'ollama' | 'openai'
const PRESETS: Array<{ key: EmbeddingPresetKey; cfg: Partial<EmbeddingConfig> }> = [
  { key: 'siliconflow', cfg: { provider: 'custom', baseUrl: '/siliconflow-proxy/v1', model: 'BAAI/bge-m3' } },
  { key: 'qwen', cfg: { provider: 'qwen', baseUrl: '/qwen-proxy/compatible-mode/v1', model: 'text-embedding-v3' } },
  { key: 'glm', cfg: { provider: 'glm', baseUrl: '/glm-proxy/api/paas/v4', model: 'embedding-3' } },
  { key: 'ollama', cfg: { provider: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'bge-m3', apiKey: '' } },
  { key: 'openai', cfg: { provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'text-embedding-3-small' } },
]

export default function EmbeddingConfigCard() {
  const { t } = useTranslation('settings')
  const { embedding, setEmbeddingConfig } = useAIConfigStore()
  const currentProjectId = useProjectStore(s => s.currentProjectId)
  const [indexing, setIndexing] = useState(false)
  const [progress, setProgress] = useState('')
  const [msg, setMsg] = useState('')

  const buildIndex = async () => {
    if (!currentProjectId) return
    setIndexing(true); setMsg(''); setProgress(t('embedding.progress.preparing'))
    try {
      const chunks = await rebuildProjectRetrievalChunks({
        projectId: currentProjectId,
        onProgress: (done, total) => setProgress(t('embedding.progress.chunking', { done, total })),
      })
      const summaries = await rebuildProjectNarrativeSummaries({
        projectId: currentProjectId,
        onProgress: (done, total) => setProgress(t('embedding.progress.summarizing', { done, total })),
      })
      if (!isEmbeddingReady(embedding)) {
        setMsg(t('embedding.messages.readyNoEmbedding', {
          chapters: chunks.chapters,
          rebuiltChapters: chunks.rebuiltChapters,
          chunks: chunks.chunks,
          chapterNodes: summaries.chapterNodes,
          volumeNodes: summaries.volumeNodes,
          bookNodes: summaries.bookNodes,
        }))
        return
      }
      const r = await ensureChunkEmbeddings({
        projectId: currentProjectId, cfg: embedding,
        onProgress: (done, total) => setProgress(t('embedding.progress.embedding', { done, total })),
      })
      setMsg(r.total === 0
        ? t('embedding.messages.readyWithEmbedding', {
            chapters: chunks.chapters,
            chunks: chunks.chunks,
            chapterNodes: summaries.chapterNodes,
            volumeNodes: summaries.volumeNodes,
            bookNodes: summaries.bookNodes,
          })
        : t('embedding.messages.completed', {
            chapters: chunks.chapters,
            rebuiltChapters: chunks.rebuiltChapters,
            chunks: chunks.chunks,
            chapterNodes: summaries.chapterNodes,
            volumeNodes: summaries.volumeNodes,
            bookNodes: summaries.bookNodes,
            embedded: r.embedded,
            skipped: r.skipped,
          }))
    } catch (e) {
      setMsg(t('embedding.messages.failed', { error: e instanceof Error ? e.message : String(e) }))
    } finally {
      setIndexing(false); setProgress('')
    }
  }

  return (
    <div className="bg-bg-surface border border-border rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold text-text-primary flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" /> {t('embedding.title')}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-normal">{t('embedding.labs')}</span>
        </h3>
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input type="checkbox" checked={embedding.enabled} onChange={e => setEmbeddingConfig({ enabled: e.target.checked })} className="accent-accent" />
          {t('embedding.enable')}
        </label>
      </div>
      <p className="text-[11px] text-text-muted mb-4 leading-relaxed" dangerouslySetInnerHTML={{ __html: t('embedding.description') }}>
      </p>

      <div className="pt-2 border-t border-border/50 mb-4">
        <button onClick={buildIndex} disabled={indexing || !currentProjectId}
          className="flex items-center gap-2 px-3 py-1.5 bg-accent/10 text-accent text-sm rounded-lg hover:bg-accent/20 disabled:opacity-40 transition-colors">
          {indexing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {indexing ? t('embedding.building', { progress }) : t('embedding.buildIndex')}
        </button>
        {!currentProjectId && <p className="text-[11px] text-text-muted mt-1.5">{t('embedding.noProject')}</p>}
        <p className="text-[11px] text-text-muted mt-1.5">
          {t('embedding.indexDescription')}
        </p>
        {msg && <p className="text-[11px] text-text-secondary mt-1.5 px-2 py-1 rounded bg-bg-base">{msg}</p>}
      </div>

      {embedding.enabled && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => {
              const labelKey = `embedding.presets.${p.key}` as const
              const noteKey = `embedding.presets.${p.key}Note` as const
              return (
                <button key={p.key} onClick={() => setEmbeddingConfig(p.cfg)}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-bg-elevated border border-border text-text-secondary hover:text-accent hover:border-accent/50 transition-colors text-left">
                  <div className="font-medium">{t(labelKey)}</div>
                  <div className="text-[10px] text-text-muted">{t(noteKey)}</div>
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-text-muted" dangerouslySetInnerHTML={{ __html: t('embedding.presetDescription') }}>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">{t('embedding.baseUrl')}</label>
              <input type="text" value={embedding.baseUrl} onChange={e => setEmbeddingConfig({ baseUrl: e.target.value })}
                className="w-full px-3 py-1.5 bg-bg-base border border-border rounded text-text-primary text-xs focus:outline-none focus:border-accent" />
              {(() => {
                const pair = PROXY_PAIRS.find(p => embedding.baseUrl === p.proxy || embedding.baseUrl === p.direct)
                if (!pair) return null
                const isProxy = embedding.baseUrl === pair.proxy
                return isProxy ? (
                  <button onClick={() => setEmbeddingConfig({ baseUrl: pair.direct })}
                    className="mt-1 text-[11px] px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">
                    {t('embedding.switchToDirect')}
                  </button>
                ) : (
                  <button onClick={() => setEmbeddingConfig({ baseUrl: pair.proxy })}
                    className="mt-1 text-[11px] px-2 py-1 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors">
                    {t('embedding.switchToProxy')}
                  </button>
                )
              })()}
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">{t('embedding.model')}</label>
              <input type="text" value={embedding.model} onChange={e => setEmbeddingConfig({ model: e.target.value })}
                className="w-full px-3 py-1.5 bg-bg-base border border-border rounded text-text-primary text-xs focus:outline-none focus:border-accent" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">{t('embedding.apiKey')} <span className="text-text-muted">{t('embedding.apiKeyHint')}</span></label>
            <input type="password" value={embedding.apiKey} onChange={e => setEmbeddingConfig({ apiKey: e.target.value })}
              placeholder="sk-..." className="w-full px-3 py-1.5 bg-bg-base border border-border rounded text-text-primary text-xs focus:outline-none focus:border-accent" />
          </div>
          <p className="text-[11px] text-text-muted">
            {t('embedding.idempotent')}
          </p>
        </div>
      )}
    </div>
  )
}
