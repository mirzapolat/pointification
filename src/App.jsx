import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth.jsx'
import Login from './pages/Login.jsx'
import Verify from './pages/Verify.jsx'
import Welcome from './pages/Welcome.jsx'
import Onboarding from './pages/Onboarding.jsx'
import GameList from './pages/GameList.jsx'
import GameScreen from './pages/GameScreen.jsx'
import Account from './pages/Account.jsx'
import PublicGame from './pages/PublicGame.jsx'
import GameLog from './pages/GameLog.jsx'
import Podium from './pages/Podium.jsx'
import Imprint from './pages/Imprint.jsx'
import Privacy from './pages/Privacy.jsx'
import Landing from './pages/Landing.jsx'
import { DialogProvider } from './components/Dialogs.jsx'

function needsWelcome(details) {
  return !details || !details.details_completed_at
}
function needsOnboarding(details) {
  return !details || !details.onboarding_completed_at
}

function Protected({ children, allow = 'app' }) {
  const { session, loading, details, detailsLoading } = useAuth()
  const loc = useLocation()
  if (loading) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  if (detailsLoading && !details) return <Splash />

  // Gate: force the new user through welcome → onboarding before reaching the app.
  if (allow === 'app') {
    if (needsWelcome(details)) return <Navigate to="/welcome" replace state={{ from: loc.pathname }} />
    if (needsOnboarding(details)) return <Navigate to="/onboarding" replace state={{ from: loc.pathname }} />
  } else if (allow === 'welcome') {
    if (!needsWelcome(details) && needsOnboarding(details)) return <Navigate to="/onboarding" replace />
    if (!needsWelcome(details) && !needsOnboarding(details)) return <Navigate to="/" replace />
  } else if (allow === 'onboarding') {
    if (needsWelcome(details)) return <Navigate to="/welcome" replace />
    if (!needsOnboarding(details)) return <Navigate to="/" replace />
  }
  return children
}

function Home() {
  const { session, loading, details, detailsLoading } = useAuth()
  if (loading) return <Splash />
  if (!session) return <Landing />
  if (detailsLoading && !details) return <Splash />
  if (needsWelcome(details)) return <Navigate to="/welcome" replace />
  if (needsOnboarding(details)) return <Navigate to="/onboarding" replace />
  return <GameList />
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
        <Route path="/verify" element={<Verify />} />
        <Route path="/welcome" element={<Protected allow="welcome"><Welcome /></Protected>} />
        <Route path="/onboarding" element={<Protected allow="onboarding"><Onboarding /></Protected>} />
        <Route path="/imprint" element={<Imprint />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/p/:token" element={<PublicGame />} />
        <Route path="/" element={<Home />} />
        <Route path="/game/:id" element={<Protected><GameScreen /></Protected>} />
        <Route path="/game/:id/log" element={<Protected><GameLog /></Protected>} />
        <Route path="/game/:id/podium" element={<Protected><Podium /></Protected>} />
        <Route path="/account" element={<Protected><Account /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DialogProvider>
  )
}
