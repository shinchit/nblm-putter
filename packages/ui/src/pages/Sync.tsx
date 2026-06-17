import { useState, useEffect, useRef } from 'react'
import { getNotebooks, startSync, getJob, pickFolder, cancelJob, createNotebook } from '../api/client'
import { ProgressBar } from '../components/ProgressBar'

interface JobLog {
  file: string
  success: boolean
  reason?: string
  at: string
}

interface Job {
  status: string
  doneFiles: number
  totalFiles: number
  currentFile: string | null
  errors: { file: string; reason: string }[]
  logs: JobLog[]
}

const TERMINAL_STATUSES = ['done', 'failed', 'cancelled']

export function Sync() {
  const [notebooks, setNotebooks] = useState<{ id: string; title: string }[]>([])
  const [notebookId, setNotebookId] = useState('')
  const [folder, setFolder] = useState('')
  const [job, setJob] = useState<Job | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [picking, setPicking] = useState(false)
  const [creating, setCreating] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getNotebooks().then(setNotebooks).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load notebooks'))
    return () => clearInterval(pollRef.current)
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [job?.logs?.length, job?.currentFile])

  async function handlePickFolder() {
    setPicking(true)
    try {
      const path = await pickFolder()
      if (path) setFolder(path)
    } catch {
      // ignore
    } finally {
      setPicking(false)
    }
  }

  async function handleCreateNotebook() {
    setCreating(true)
    setError('')
    try {
      const nb = await createNotebook()
      setNotebooks(prev => [nb, ...prev])
      setNotebookId(nb.id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create notebook')
    } finally {
      setCreating(false)
    }
  }

  async function handleSync() {
    if (!notebookId || !folder) return
    setError('')
    setLoading(true)
    setJob(null)
    setJobId(null)
    setCancelling(false)
    try {
      const { jobId: id } = await startSync(folder, notebookId, 1)
      setJobId(id)
      pollRef.current = setInterval(async () => {
        try {
          const j = await getJob(id)
          setJob(j as Job)
          if (TERMINAL_STATUSES.includes(j.status)) {
            clearInterval(pollRef.current)
            setLoading(false)
            setCancelling(false)
          }
        } catch {
          clearInterval(pollRef.current)
          setLoading(false)
        }
      }, 1000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setLoading(false)
    }
  }

  async function handleCancel() {
    if (!jobId) return
    setCancelling(true)
    try {
      await cancelJob(jobId)
    } catch {
      setCancelling(false)
    }
  }

  const pct = job && job.totalFiles > 0 ? Math.round((job.doneFiles / job.totalFiles) * 100) : 0

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-semibold mb-6">Sync Files</h2>

      {error && <p className="text-red-600 mb-4 text-sm">{error}</p>}

      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Notebook</label>
          <div className="flex gap-2">
            <select
              className="flex-1 border rounded px-3 py-2"
              value={notebookId}
              onChange={e => setNotebookId(e.target.value)}
              disabled={loading}
            >
              <option value="">Select a notebook...</option>
              {notebooks.map(nb => (
                <option key={nb.id} value={nb.id}>{nb.title}</option>
              ))}
            </select>
            <button
              type="button"
              className="px-3 py-2 border rounded text-sm hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
              onClick={handleCreateNotebook}
              disabled={creating || loading}
              title="新しいノートブックを作成"
            >
              {creating ? '作成中...' : '+ 新規作成'}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Folder Path</label>
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 border rounded px-3 py-2 font-mono text-sm"
              placeholder="/path/to/your/folder"
              value={folder}
              onChange={e => setFolder(e.target.value)}
            />
            <button
              type="button"
              className="px-3 py-2 border rounded text-sm hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
              onClick={handlePickFolder}
              disabled={picking || loading}
            >
              {picking ? '...' : 'Browse...'}
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            onClick={handleSync}
            disabled={loading || !notebookId || !folder}
          >
            {loading ? 'Syncing...' : 'Sync'}
          </button>
          {loading && (
            <button
              className="px-4 py-2 border border-red-400 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? '中止中...' : '中止'}
            </button>
          )}
        </div>

        {job && (
          <div className="mt-2 flex flex-col gap-3">
            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>
                  {job.status === 'done' && '✓ 完了'}
                  {job.status === 'failed' && '✗ 失敗'}
                  {job.status === 'cancelled' && '⏹ 中止'}
                  {job.status === 'running' && job.currentFile
                    ? <>処理中: <span className="font-mono">{job.currentFile}</span></>
                    : job.status === 'running' ? 'ブラウザを起動中...' : null}
                </span>
                <span>{job.doneFiles} / {job.totalFiles} ({pct}%)</span>
              </div>
              <ProgressBar value={job.doneFiles} total={job.totalFiles} />
            </div>

            {(job.logs.length > 0 || job.currentFile) && (
              <div className="border rounded bg-gray-50 text-xs font-mono max-h-64 overflow-y-auto p-2 flex flex-col gap-0.5">
                {job.logs.map((entry, i) => (
                  <div key={i} className={`flex gap-2 ${entry.success ? 'text-gray-700' : 'text-red-600'}`}>
                    <span className="shrink-0">{entry.success ? '✓' : '✗'}</span>
                    <span className="truncate flex-1">{entry.file}</span>
                    {!entry.success && entry.reason && (
                      <span className="text-red-400 shrink-0 truncate max-w-xs" title={entry.reason}>
                        {entry.reason.split('\n')[0]}
                      </span>
                    )}
                    <span className="text-gray-400 shrink-0">{new Date(entry.at).toLocaleTimeString()}</span>
                  </div>
                ))}
                {job.currentFile && (
                  <div className="flex gap-2 text-blue-600 animate-pulse">
                    <span className="shrink-0">→</span>
                    <span className="truncate">{job.currentFile}</span>
                  </div>
                )}
                <div ref={logEndRef} />
              </div>
            )}

            {job.status === 'done' && (
              <p className="text-green-600 text-sm">
                ✓ 完了 — {job.doneFiles - job.errors.length} 件成功
                {job.errors.length > 0 && `、${job.errors.length} 件失敗`}
              </p>
            )}
            {job.status === 'cancelled' && (
              <p className="text-yellow-600 text-sm">
                ⏹ 中止 — {job.doneFiles} 件処理済み
              </p>
            )}
            {job.status === 'failed' && job.doneFiles === 0 && (
              <p className="text-red-600 text-sm">✗ 同期に失敗しました。セッションを確認してください。</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
