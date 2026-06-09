import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import './Header.css'

interface User {
  id: string
  email?: string
}

export default function Header({ user }: { user: User | null }) {
  const navigate = useNavigate()
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [username, setUsername] = useState('Usuario')

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user?.id) return

      const { data } = await supabase
        .from('users')
        .select('username, name, surname')
        .eq('id', user.id)
        .maybeSingle()

      setUsername(data?.username || user.email?.split('@')[0] || 'Usuario')
    }

    fetchUserProfile()
  }, [user])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <header className="app-header">

      {/* LOGO + TEXTO */}
      <div className="header-logo" onClick={() => navigate('/')}>
        <img
          src="./src/assets/logo.png"
          alt="ChainVote logo"
          className="app-logo"
        />
        <span className="logo-text">ChainVote</span>
      </div>

      <div className="header-user" ref={dropdownRef} onMouseLeave={() => setShowDropdown(false)}>

        <button
          className="user-button"
          onClick={() => setShowDropdown(v => !v)}
        >
          👤 {username} ▼
        </button>

        {showDropdown && (
          <div className="dropdown-menu">

            <button
              className="dropdown-item"
              onClick={() => navigate('/profile')}
            >
              Perfil
            </button>

            <button
              className="dropdown-item"
              onClick={handleLogout}
            >
              Cerrar sesión
            </button>

          </div>
        )}

      </div>

    </header>
  )
}