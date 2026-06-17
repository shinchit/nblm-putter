import { useState } from 'react'
import { uploadSession } from '../api/client'

export function Session() {
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus('idle')
    setError('')
    try {
      const text = await file.text()
      const json = JSON.parse(text) as unknown
      await uploadSession(json)
      setStatus('success')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus('error')
    }
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-semibold mb-6">Session</h2>
      <p className="text-sm text-gray-600 mb-2">
        To refresh the session, run{' '}
        <code className="bg-gray-100 px-1 rounded">nblm-putter auth</code>{' '}
        locally, then upload the generated session.json file.
      </p>
      <p className="text-xs text-gray-400 mb-6">
        File location: <code>~/.nblm-putter/session.json</code>
      </p>

      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:border-blue-400 bg-white">
        <span className="text-gray-500 text-sm">Click to upload session.json</span>
        <input type="file" accept=".json" className="hidden" onChange={handleFileChange} />
      </label>

      {status === 'success' && <p className="text-green-600 mt-4">✓ Session updated successfully.</p>}
      {status === 'error' && <p className="text-red-600 mt-4">✗ {error}</p>}
    </div>
  )
}
