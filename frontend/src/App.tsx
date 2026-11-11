import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabase'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session),
    )

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="loading-screen" role="status" aria-label="Loading">
        <span className="spinner spinner-lg" aria-hidden="true" />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Auth page: already-signed-in users go straight to the dashboard */}
        <Route
          path="/auth"
          element={session ? <Navigate to="/dashboard" replace /> : <Auth />}
        />
        {/* Dashboard is protected: signed-out users are sent to /auth */}
        <Route
          path="/dashboard"
          element={session ? <Dashboard session={session} /> : <Navigate to="/auth" replace />}
        />
        {/* Unknown routes land on the right page depending on session */}
        <Route path="*" element={<Navigate to={session ? '/dashboard' : '/auth'} replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
