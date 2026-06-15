import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import './i18n'
import { AuthProvider, useAuth } from './lib/auth'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Improvements from './pages/Improvements'
import ImprovementForm from './pages/ImprovementForm'
import ImprovementDetail from './pages/ImprovementDetail'
import ImprovementPresent from './pages/ImprovementPresent'
import Leaderboard from './pages/Leaderboard'
import Forum from './pages/Forum'
import Admin from './pages/Admin'
import Users from './pages/Users'
import Teams from './pages/Teams'
import Awards from './pages/Awards'
import Login from './pages/Login'

function FullScreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin border-4 border-blue-600 border-t-transparent rounded-full w-8 h-8" />
    </div>
  )
}

function RequireAuthLayout() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullScreenSpinner />
  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (session) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route element={<RequireAuthLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/improvements" element={<Improvements />} />
            <Route path="/improvements/new" element={<ImprovementForm />} />
            <Route path="/improvements/:id/edit" element={<ImprovementForm />} />
            <Route path="/improvements/:id" element={<ImprovementDetail />} />
            <Route path="/improvements/:id/present" element={<ImprovementPresent />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/forum" element={<Forum />} />
            <Route path="/awards" element={<Awards />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/users" element={<Users />} />
            <Route path="/teams" element={<Teams />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
