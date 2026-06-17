const BASE = '/api'

export async function getNotebooks(): Promise<{ id: string; title: string }[]> {
  const res = await fetch(`${BASE}/notebooks`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? 'Failed to fetch notebooks')
  }
  return res.json() as Promise<{ id: string; title: string }[]>
}

export async function startSync(folder: string, notebookId: string, concurrency = 1): Promise<{ jobId: string }> {
  const res = await fetch(`${BASE}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder, notebookId, concurrency }),
  })
  if (!res.ok) throw new Error('Failed to start sync')
  return res.json() as Promise<{ jobId: string }>
}

export async function getJob(jobId: string): Promise<{ status: string; doneFiles: number; totalFiles: number; currentFile: string | null; errors: { file: string; reason: string }[]; logs: { file: string; success: boolean; reason?: string; at: string }[] }> {
  const res = await fetch(`${BASE}/jobs/${jobId}`)
  if (!res.ok) throw new Error('Failed to get job')
  return res.json()
}

export async function listJobs(): Promise<{ jobId: string; status: string; notebookId: string; doneFiles: number; totalFiles: number; errors: { file: string; reason: string }[]; createdAt: string }[]> {
  const res = await fetch(`${BASE}/jobs`)
  if (!res.ok) throw new Error('Failed to list jobs')
  return res.json()
}

export async function getIgnorePatterns(): Promise<string[]> {
  const res = await fetch(`${BASE}/settings/ignore`)
  if (!res.ok) throw new Error('Failed to get patterns')
  return res.json() as Promise<string[]>
}

export async function saveIgnorePatterns(patterns: string[]): Promise<void> {
  const res = await fetch(`${BASE}/settings/ignore`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patterns }),
  })
  if (!res.ok) throw new Error('Failed to save patterns')
}

export async function createNotebook(): Promise<{ id: string; title: string }> {
  const res = await fetch(`${BASE}/notebooks`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? 'Failed to create notebook')
  }
  return res.json() as Promise<{ id: string; title: string }>
}

export async function cancelJob(jobId: string): Promise<void> {
  const res = await fetch(`${BASE}/jobs/${jobId}/cancel`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to cancel job')
}

export async function pickFolder(): Promise<string | null> {
  const res = await fetch(`${BASE}/folder/pick`)
  if (!res.ok) throw new Error('Failed to open folder picker')
  const data = await res.json() as { path: string | null }
  return data.path
}

export async function uploadSession(sessionJson: unknown): Promise<void> {
  const res = await fetch(`${BASE}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sessionJson),
  })
  if (!res.ok) throw new Error('Failed to upload session')
}
