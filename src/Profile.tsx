import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { ElectionRepository } from './ElectionRepository'
import type { UserProfile } from './ElectionRepository'
import './Profile.css'

type AdvancedStats = {
  activeElectionsCount: number
  pendingVotesCount: number
  completedVotesCount: number
  lostVotesCount: number
  participationRate: number
  totalElectionsCensused: number
}

// Estructura limpia para el historial de transacciones
type TransactionItem = {
  electionTitle: string
  type: 'Creación' | 'Commit' | 'Reveal'
  txHash: string | null
}

export default function Profile() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [profile, setProfile] = useState<UserProfile & { is_admin?: boolean; avatar?: string | null } | null>(null)
  const [stats, setStats] = useState<AdvancedStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  
  // Estado para las transacciones combinadas
  const [transactions, setTransactions] = useState<TransactionItem[]>([])

  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData.user) {
          navigate('/auth')
          return
        }

        const data = await ElectionRepository.getUserProfileAndStats(
          userData.user.id, 
          userData.user.email || ''
        )

        setProfile(data.profile)
        setStats(data.stats)

        // --- EXTRACCIÓN SÍNCRONA DE HASHES DESDE TU BASE DE DATOS ---
        const txList: TransactionItem[] = []

        // 1. Si es administrador, extrae las transacciones de creación
        if (data.profile?.is_admin) {
          const { data: createdElections } = await supabase
            .from('elections')
            .select('title, tx_hash_create')
            .eq('admin_id', userData.user.id)
          
          createdElections?.forEach(el => {
            if (el.tx_hash_create) {
              txList.push({
                electionTitle: el.title,
                type: 'Creación',
                txHash: el.tx_hash_create
              })
            }
          })
        }

        // 2. Extrae las transacciones de votación (Commit y Reveal)
        const { data: userElections } = await supabase
          .from('user_election')
          .select('tx_hash_commit, tx_hash_reveal, elections(title)')
          .eq('user_id', userData.user.id)

        userElections?.forEach((ue: any) => {
          const title = ue.elections?.title || 'Elección Convocada'
          if (ue.tx_hash_commit) {
            txList.push({
              electionTitle: title,
              type: 'Commit',
              txHash: ue.tx_hash_commit
            })
          }
          if (ue.tx_hash_reveal) {
            txList.push({
              electionTitle: title,
              type: 'Reveal',
              txHash: ue.tx_hash_reveal
            })
          }
        })

        setTransactions(txList)

      } catch (error) {
        console.error("Error cargando estadísticas avanzadas:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchProfileData()
  }, [navigate])

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!event.target.files || event.target.files.length === 0 || !profile) return
      
      setUploading(true)
      const file = event.target.files[0]
      const publicUrl = await ElectionRepository.uploadAvatar(profile.id, file)
      await ElectionRepository.updateAvatarUrl(profile.id, publicUrl)

      setProfile(prev => prev ? { ...prev, avatar: `${publicUrl}?t=${Date.now()}` } : null);
      alert("¡Imagen de perfil actualizada con éxito!")
    } catch (error: any) {
      console.error("Error subiendo el avatar:", error)
      alert("Hubo un error al subir la imagen: " + error.message)
    } finally {
      setUploading(false)
    }
  }

  // Helper para acortar la vista de los hashes sin romper layouts
  const formatHash = (hash: string) => `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`

  if (loading) {
    return <div className="profile-container">Cargando auditoría de perfil...</div>
  }

  return (
    <div className="profile-container" style={{ display: 'flex', flexDirection: 'column', gap: '30px', paddingBottom: '40px' }}>
      
      {/* CONTENEDOR GRID: Sincroniza y estira ambas tarjetas tomando la altura de la más larga */}
      <div className="profile-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', alignItems: 'stretch', width: '100%' }}>
        
        {/* TARJETA DE PERFIL */}
        <div className="profile-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
          
          {/* CONTENEDOR FLEX PARA TÍTULO + BADGE */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h1 className="profile-title" style={{ margin: 0 }}>Mi Perfil</h1>
            
            <span style={{ 
              fontSize: '0.75em', 
              backgroundColor: profile?.is_admin ? '#ef4444' : '#7810b9', 
              color: 'white', 
              padding: '6px 14px', 
              borderRadius: '6px', 
              fontWeight: 800, 
              fontFamily: 'system-ui, -apple-system, sans-serif', 
              letterSpacing: '1px', 
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)' 
            }}>
              {profile?.is_admin ? 'ADMIN' : 'VOTANTE'}
            </span>
          </div>

          {/* AVATAR INTERACTIVO A LA IZQUIERDA (Sin texto que lo manche) */}
          <div 
            className="profile-avatar profile-avatar-left" 
            onClick={() => !uploading && fileInputRef.current?.click()}
            style={{ 
              cursor: uploading ? 'not-allowed' : 'pointer',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#1e293b',
              border: profile?.avatar ? 'none' : '2px dashed #5B58F5',
              borderRadius: '50%',
              width: '100px',
              height: '100px',
              margin: '0 0 20px 0',
              transition: 'all 0.3s ease'
            }}
            title="Haz clic para cambiar tu foto de perfil"
          >
            {uploading ? (
              <span style={{ fontSize: '0.8em', color: '#94a3b8' }}>...</span>
            ) : profile?.avatar ? (
              <img 
                src={profile.avatar} 
                alt="Avatar" 
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} 
              />
            ) : (
              <span style={{ fontSize: '2.5rem' }}>👤</span>
            )}
          </div>

          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleAvatarChange} 
            accept="image/*" 
            style={{ display: 'none' }} 
          />

          <div className="profile-info" style={{ flexGrow: 1 }}>
            <p className="info-row">
              <span className="info-label">Nombre:</span>
              <span className="info-value">{profile?.name || 'No asignado'}</span>
            </p>
            <p className="info-row">
              <span className="info-label">Apellidos:</span>
              <span className="info-value">{profile?.surname || 'No asignado'}</span>
            </p>
            <p className="info-row">
              <span className="info-label">Alias:</span>
              <span className="info-value" style={{ color: '#ffffff' }}>@{profile?.username}</span>
            </p>
            <p className="info-row">
              <span className="info-label">Correo:</span>
              <span className="info-value" style={{ fontSize: '0.9em' }}>{profile?.email}</span>
            </p>
          </div>
        </div>

        {/* SECCIÓN DE ESTADÍSTICAS (Participación) */}
        <div className="stats-card" style={{ display: 'flex', flexDirection: 'column', gap: '15px', height: '100%', boxSizing: 'border-box' }}>
          <h2 className="stats-title">Participación</h2>
          
          {/* BARRA DE PARTICIPACIÓN DEMOCRÁTICA */}
          <div style={{ backgroundColor: '#1e293b', padding: '15px', borderRadius: '8px', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '0.9em' }}>
              <span style={{ color: 'white' }}>Tasa de Asistencia Electoral:</span>
              <span style={{ color: '#00E676', fontWeight: 'bold' }}>{stats?.participationRate}%</span>
            </div>
            <div style={{ width: '100%', backgroundColor: '#0f172a', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
              <div style={{ width: `${stats?.participationRate}%`, backgroundColor: '#00E676', height: '100%', transition: 'width 0.5s ease-in-out' }}></div>
            </div>
            <p style={{ fontSize: '0.75em', color: '#94a3b8', marginTop: '8px' }}>
              Has participado en {stats?.totalElectionsCensused} convocatorias oficiales de tu censo.
            </p>
          </div>

          <div className="stat-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid #334155' }}>
            <span style={{ color: 'white' }}>Urnas en fase activa (Abiertas):</span>
            <strong style={{ color: '#5B58F5' }}>{stats?.activeElectionsCount}</strong>
          </div>

          <div className="stat-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid #334155' }}>
            <span style={{ color: 'white' }}>🔒 Votos en "Sobre Cerrado" (Commit):</span>
            <strong style={{ color: '#f59e0b' }}>{stats?.pendingVotesCount}</strong>
          </div>

          <div className="stat-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid #334155' }}>
            <span style={{ color: 'white' }}>🔓 Votos Abiertos/Escrutados (Reveal):</span>
            <strong style={{ color: '#10b981' }}>{stats?.completedVotesCount}</strong>
          </div>

          <div className="stat-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', color: stats?.lostVotesCount && stats.lostVotesCount > 0 ? '#ef4444' : '#94a3b8' }}>
            <span>⚠️ Votos Nulos (Sin apertura/Reveal):</span>
            <strong>{stats?.lostVotesCount}</strong>
          </div>
          
          {stats?.lostVotesCount && stats.lostVotesCount > 0 ? (
            <p style={{ fontSize: '0.75em', color: '#ef4444', backgroundColor: '#2d1a1e', padding: '8px', borderRadius: '4px', marginTop: '-5px' }}>
              * Alerta: Tienes sobres criptográficos que no abriste a tiempo antes del fin del recuento blockchain.
            </p>
          ) : null}
        </div>
      </div>

      {/* TARJETA CENTRADA: MIS TRANSACCIONES (Auditoría Criptográfica Web3) */}
      <div className="transactions-card" style={{ 
        backgroundColor: '#111827', 
        border: '1px solid #1f2937', 
        borderRadius: '12px', 
        padding: '24px', 
        width: '100%', 
        boxSizing: 'border-box',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
      }}>
        <h2 style={{ color: 'white', fontSize: '1.4rem', margin: '0 0 20px 0', fontFamily: 'system-ui, sans-serif', fontWeight: 700 }}>
          Mis Transacciones en Blockchain
        </h2>
        
        {transactions.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: '0.9em', textAlign: 'center', padding: '20px 0', border: '1px dashed #334155', borderRadius: '8px' }}>
            No se registran firmas de bloques vinculadas en Sepolia para esta cuenta actualmente.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
            {transactions.map((tx, idx) => (
              <div key={idx} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                backgroundColor: '#1e293b', 
                padding: '12px 16px', 
                borderRadius: '8px',
                border: '1px solid #334155'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ color: 'white', fontWeight: 600, fontSize: '0.95em' }}>{tx.electionTitle}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ 
                      fontSize: '0.75em', 
                      padding: '3px 8px', 
                      borderRadius: '4px', 
                      color: 'white',
                      fontWeight: 700,
                      backgroundColor: tx.type === 'Creación' ? '#3b82f6' : tx.type === 'Commit' ? '#f59e0b' : '#10b981'
                    }}>
                      {tx.type}
                    </span>
                    <span style={{ color: '#94a3b8', fontSize: '0.85em', fontFamily: 'monospace' }}>
                      {tx.txHash ? formatHash(tx.txHash) : ''}
                    </span>
                  </div>
                </div>

                {tx.txHash && (
                  <a 
                    href={`https://sepolia.etherscan.io/tx/${tx.txHash}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    title="Auditar transacción en Etherscan"
                    style={{ 
                      backgroundColor: '#4f46e5', 
                      color: 'white', 
                      textDecoration: 'none', 
                      padding: '8px 14px', 
                      borderRadius: '6px', 
                      fontSize: '0.85em', 
                      fontWeight: 600,
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4338ca'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#4f46e5'}
                  >
                    Ver en Etherscan ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* BOTÓN CENTRAL: Posicionado limpiamente debajo del flujo de las tarjetas */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px', width: '100%' }}>
        <button className="back-button" onClick={() => navigate('/')} aria-label="Volver" style={{ position: 'static', transform: 'none' }}>
          ←
        </button>
      </div>

    </div>
  )
}