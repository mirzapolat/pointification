import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/auth.jsx'
import Login from './pages/Login.jsx'
import GameList from './pages/GameList.jsx'
import GameScreen from './pages/GameScreen.jsx'
import Account from './pages/Account.jsx'
import PublicGame from './pages/PublicGame.jsx'
import GameLog from './pages/GameLog.jsx'
import Imprint from './pages/Imprint.jsx'
import Privacy from './pages/Privacy.jsx'
import Landing from './pages/Landing.jsx'
import { DialogProvider } from './components/Dialogs.jsx'

function Protected({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  return children
}

function Home() {
  const { session, loading } = useAuth()
  if (loading) return <Splash />
  return session ? <GameList /> : <Landing />
}

function Splash() {
  return (
    <div className="h-full flex items-center justify-center bg-cream">
      <div className="font-display text-3xl animate-pulse">loading…</div>
    </div>
  )
}

export default function App() {
  return (
    <DialogProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/imprint" element={<Imprint />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/p/:token" element={<PublicGame />} />
        <Route path="/" element={<Home />} />
        <Route path="/game/:id" element={<Protected><GameScreen /></Protected>} />
        <Route path="/game/:id/log" element={<Protected><GameLog /></Protected>} />
        <Route path="/account" element={<Protected><Account /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DialogProvider>
  )
}
