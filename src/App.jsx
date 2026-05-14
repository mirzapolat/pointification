import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useAuth } from './lib/auth.jsx'
import Login from './pages/Login.jsx'
import GameList from './pages/GameList.jsx'
import GameScreen from './pages/GameScreen.jsx'
import Account from './pages/Account.jsx'
import PublicGame from './pages/PublicGame.jsx'

function Protected({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  return children
}

function Splash() {
  return (
    <div className="h-full flex items-center justify-center bg-cream">
      <div className="font-display text-3xl animate-pulse">loading…</div>
    </div>
  )
}

export default function App() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<Login />} />
        <Route path="/p/:token" element={<PublicGame />} />
        <Route path="/" element={<Protected><GameList /></Protected>} />
        <Route path="/game/:id" element={<Protected><GameScreen /></Protected>} />
        <Route path="/account" element={<Protected><Account /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  )
}
