import { useState, useEffect } from 'react'
import { listJobs } from '../api/client'

type Job = {
  jobId: string
  status: string
  notebookId: string
  doneFiles: number
  totalFiles: number
  errors: { file: string; reason: string }[]
  createdAt: string
}

const statusColor: Record<string, string> = {
  done: 'text-green-600',
  failed: 'text-red-600',
  running: 'text-blue-600',
  pending: 'text-gray-500',
}

export function History() {
  const [jobs, setJobs] = useState<Job[]>([])

  useEffect(() => { listJobs().then(setJobs).catch(console.error) }, [])

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">Job History</h2>
      {jobs.length === 0 && <p className="text-gray-500">No jobs yet.</p>}
      <div className="flex flex-col gap-3">
        {jobs.map(job => (
          <div key={job.jobId} className="border rounded p-4 bg-white">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-mono text-xs text-gray-400">{job.jobId}</p>
                <p className="text-sm mt-1">Notebook: {job.notebookId}</p>
                <p className="text-sm">{job.doneFiles} / {job.totalFiles} files</p>
              </div>
              <div className="text-right">
                <span className={`text-sm font-medium ${statusColor[job.status] ?? 'text-gray-500'}`}>{job.status}</span>
                <p className="text-xs text-gray-400 mt-1">{new Date(job.createdAt).toLocaleString('ja-JP')}</p>
              </div>
            </div>
            {job.errors?.length > 0 && (
              <details className="mt-2">
                <summary className="text-yellow-600 text-sm cursor-pointer">{job.errors.length} error(s)</summary>
                <ul className="text-xs text-gray-500 mt-1">
                  {job.errors.map((e, i) => <li key={i}>{e.file}</li>)}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
