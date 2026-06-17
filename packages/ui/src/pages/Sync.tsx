import { useState, useEffect, useRef } from 'react'
import { getNotebooks, startSync, getJob, pickFolder } from '../api/client'
import { ProgressBar } from '../components/ProgressBar'

export function Sync() {
  const [notebooks, setNotebooks] = useState<{ id: string; title: string }[]>([])
  const [notebookId, setNotebookId] = useState('')
  const [folder, setFolder] = useState('')
  const [concurrency, setConcurrency] = useState(1)
  const [job, setJob] = useState<{ status: string; doneFiles: number; totalFiles: number; errors: { file: string; reason: string }[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  useEffect(() => {
    getNotebooks().then(setNotebooks).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load notebooks'))
    return () => clearInterval(pollRef.current)
  }, [])

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

  async function handleSync() {
    if (!notebookId || !folder) return
    setError('')
    setLoading(true)
    setJob(null)
    try {
      const { jobId } = await startSync(folder, notebookId, concurrency)
      pollRef.current = setInterval(async () => {
        try {
          const j = await getJob(jobId)
          setJob(j)
          if (j.status === 'done' || j.status === 'failed') {
            clearInterval(pollRef.current)
            setLoading(false)
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

  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-semibold mb-6">Sync Files</h2>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Notebook</label>
          <select
            className="w-full border rounded px-3 py-2"
            value={notebookId}
            onChange={e => setNotebookId(e.target.value)}
          >
            <option value="">Select a notebook...</option>
            {notebooks.map(nb => (
              <option key={nb.id} value={nb.id}>{nb.title}</option>
            ))}
          </select>
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

        <div>
          <label className="block text-sm font-medium mb-1">
            Concurrency
            <span className="ml-2 font-normal text-gray-500 text-xs">同時アップロード数（1〜10）</span>
          </label>
          <input
            type="number"
            min={1}
            max={10}
            className="w-24 border rounded px-3 py-2 text-sm"
            value={concurrency}
            onChange={e => setConcurrency(Math.max(1, Math.min(10, Number(e.target.value))))}
          />
        </div>

        <button
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          onClick={handleSync}
          disabled={loading || !notebookId || !folder}
        >
          {loading ? 'Syncing...' : 'Sync'}
        </button>

        {job && (
          <div className="mt-4">
            <ProgressBar value={job.doneFiles} total={job.totalFiles} />
            {job.status === 'done' && (
              <p className="text-green-600 mt-2">✓ Sync complete!</p>
            )}
            {job.status === 'failed' && (
              <p className="text-red-600 mt-2">✗ Sync failed. Check session.</p>
            )}
            {job.errors?.length > 0 && (
              <details className="mt-2">
                <summary className="text-yellow-600 cursor-pointer">{job.errors.length} error(s)</summary>
                <ul className="text-sm text-gray-600 mt-1">
                  {job.errors.map((e, i) => (
                    <li key={i}>{e.file}: {e.reason}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
