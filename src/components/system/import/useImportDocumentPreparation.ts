import { useMemo, useRef, useState } from 'react'
import { extractTextFromFile } from '../../../lib/doc-parser'
import { chunkDocument, type ChunkPlan } from '../../../lib/import/chunker'
import { detectVolumeStructure, type VolumeDetectResult } from '../../../lib/import/volume-detector'
import i18n from '../../../i18n/i18n'

const DEFAULT_CHUNK_SIZE = 50000

export default function useImportDocumentPreparation() {
  const [filename, setFilename] = useState('')
  const [rawText, setRawText] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const [loadingFile, setLoadingFile] = useState(false)
  const [extractInfo, setExtractInfo] = useState<string | null>(null)
  const [plans, setPlans] = useState<ChunkPlan[] | null>(null)
  const [chunkSize, setChunkSize] = useState(DEFAULT_CHUNK_SIZE)
  const [showConfirm, setShowConfirm] = useState(false)
  const [volumeDetect, setVolumeDetect] = useState<VolumeDetectResult | null>(null)
  const lastUploadedFile = useRef<File | null>(null)

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setFileError(null)
    setExtractInfo(null)
    setFilename(file.name)
    setRawText('')
    setPlans(null)
    setLoadingFile(true)
    lastUploadedFile.current = file
    try {
      const result = await extractTextFromFile(file)
      setRawText(result.text)
      const parts = [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        i18n.t('import:prep.fileSize', { size: (file.size / 1024 / 1024).toFixed(2) }) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        i18n.t('import:prep.extractedChars', { count: result.rawChars.toLocaleString() }) as any,
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (result.pageCount) parts.push(i18n.t('import:prep.pages', { count: result.pageCount }) as any)
      setExtractInfo(parts.join(' · '))
    } catch (error) {
      setFilename('')
      lastUploadedFile.current = null
      setFileError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoadingFile(false)
    }
  }

  const handleRawTextChange = (text: string) => {
    setRawText(text)
    setPlans(null)
    lastUploadedFile.current = null
  }

  const prepareConfirmation = () => {
    if (!rawText.trim()) return
    setPlans(chunkDocument(rawText, { targetChars: chunkSize }))
    setVolumeDetect(detectVolumeStructure(rawText))
    setShowConfirm(true)
  }

  const handleChunkSizeChange = (size: number) => {
    setChunkSize(size)
    if (rawText.trim()) setPlans(chunkDocument(rawText, { targetChars: size }))
  }

  const sourceBlob = () => ({
    blob: lastUploadedFile.current ?? new Blob([rawText], { type: 'text/plain;charset=utf-8' }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filename: lastUploadedFile.current?.name || filename || (i18n.t('import:prep.pastedContent') as any),
  })

  const previewPlans = useMemo(() => {
    if (!rawText.trim()) return null
    return plans || chunkDocument(rawText, { targetChars: chunkSize })
  }, [chunkSize, plans, rawText])

  return {
    filename,
    rawText,
    fileError,
    loadingFile,
    extractInfo,
    plans,
    chunkSize,
    showConfirm,
    volumeDetect,
    previewPlans,
    handleFile,
    handleRawTextChange,
    prepareConfirmation,
    handleChunkSizeChange,
    closeConfirm: () => setShowConfirm(false),
    sourceBlob,
  }
}
