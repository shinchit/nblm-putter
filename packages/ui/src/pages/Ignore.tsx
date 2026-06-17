import { useState, useEffect } from 'react'
import { getIgnorePatterns, saveIgnorePatterns } from '../api/client'

export function Ignore() {
  const [patterns, setPatterns] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { getIgnorePatterns().then(setPatterns).catch(console.error) }, [])

  async function addPattern() {
    const trimmed = input.trim()
    if (!trimmed || patterns.includes(trimmed)) return
    const next = [...patterns, trimmed]
    setSaving(true)
    try {
      await saveIgnorePatterns(next)
      setPatterns(next)
      setInput('')
    } finally {
      setSaving(false)
    }
  }

  async function removePattern(pattern: string) {
    const next = patterns.filter(p => p !== pattern)
    setSaving(true)
    try {
      await saveIgnorePatterns(next)
      setPatterns(next)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-semibold mb-6">Ignore Patterns</h2>
      <p className="text-sm text-gray-500 mb-4">
        Glob patterns to exclude from sync (e.g. <code className="bg-gray-100 px-1 rounded">*.log</code>, <code className="bg-gray-100 px-1 rounded">node_modules/</code>)
      </p>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          className="flex-1 border rounded px-3 py-2 font-mono text-sm"
          placeholder="*.log"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addPattern() }}
        />
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          onClick={addPattern}
          disabled={saving}
        >
          Add
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {patterns.map(p => (
          <li key={p} className="flex justify-between items-center border rounded px-3 py-2 bg-white">
            <code className="text-sm">{p}</code>
            <button
              className="text-red-500 hover:text-red-700 text-sm"
              onClick={() => removePattern(p)}
              disabled={saving}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
