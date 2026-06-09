import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'

import Auth from './Auth.tsx'
import Home from './mainPage.tsx'
import Header from './Header.tsx'
import Profile from './Profile.tsx'
import BlockExplorer from './blockchain/BlockExplorer'
import ElectionDetail from './ElectionDetail.tsx'

type AppUser = {
  id: string
  email?: string
}

function App() {
  const [user, setUser] = useState<AppUser | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  return (
    <Router>
      <Routes>

        {/* 🔴 LOGIN ROUTE */}
        <Route
          path="/auth"
          element={!user ? <Auth /> : <Navigate to="/" />}
        />

        {/* 🔵 PROTECTED ROUTES */}
        {user && (
          <>
            <Route
              path="/"
              element={
                <>
                  <Header user={user} />
                  <Home
                    showCreateForm={showCreateForm}
                    setShowCreateForm={setShowCreateForm}
                  />
                </>
              }
            />

            <Route path="/profile" element={<><Header user={user} /><Profile /></>} />
            <Route path="/explorer" element={<><Header user={user} /><BlockExplorer /></>} />
            <Route path="/election/:id" element={<><Header user={user} /><ElectionDetail /></>} />
          </>
        )}

        {/* fallback */}
        <Route path="*" element={<Navigate to={user ? "/" : "/auth"} />} />

      </Routes>
    </Router>
  )
}

export default App