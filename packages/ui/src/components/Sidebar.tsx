import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Sync' },
  { to: '/history', label: 'History' },
  { to: '/ignore', label: 'Ignore' },
  { to: '/session', label: 'Session' },
]

export function Sidebar() {
  return (
    <nav className="w-48 bg-gray-900 text-white min-h-screen p-4 flex flex-col gap-2">
      <h1 className="text-lg font-bold mb-6 text-blue-400">nblm-putter</h1>
      {links.map(link => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.to === '/'}
          className={({ isActive }) =>
            `px-3 py-2 rounded text-sm ${isActive ? 'bg-blue-600' : 'hover:bg-gray-700'}`
          }
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  )
}
