interface Props {
  value: number
  total: number
}

export function ProgressBar({ value, total }: Props) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100)
  return (
    <div>
      <div className="flex justify-between text-sm text-gray-600 mb-1">
        <span>{pct}%</span>
        <span>{value} / {total} files</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className="bg-blue-500 h-3 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
