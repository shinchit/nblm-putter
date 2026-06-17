import { Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { Sync } from './pages/Sync'
import { History } from './pages/History'
import { Ignore } from './pages/Ignore'
import { Session } from './pages/Session'

export default function App() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-8">
        <Routes>
          <Route path="/" element={<Sync />} />
          <Route path="/history" element={<History />} />
          <Route path="/ignore" element={<Ignore />} />
          <Route path="/session" element={<Session />} />
        </Routes>
      </main>
    </div>
  )
}
