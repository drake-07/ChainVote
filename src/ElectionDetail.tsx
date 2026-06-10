import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient' // Solo lo conservamos para recuperar la sesión del usuario logueado
import { ElectionRepository } from './ElectionRepository'
import type { Election, Result } from './ElectionRepository'
import './index.css'

export default function ElectionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [election, setElection] = useState<Election | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [changingStatus, setChangingStatus] = useState(false)

  // Estados Censo
  const [userStatus, setUserStatus] = useState<string>('none')
  const [pendingUsers, setPendingUsers] = useState<any[]>([])

  // Estados Commit
  const [hasVoted, setHasVoted] = useState(false)
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const [isVoting, setIsVoting] = useState(false)

  // Estados Reveal
  const [hasRevealed, setHasRevealed] = useState(false)
  const [isRevealing, setIsRevealing] = useState(false)
  const [userSalt, setUserSalt] = useState<string | null>(null)
  const [savedOptionIndex, setSavedOptionIndex] = useState<number | null>(null)

  useEffect(() => {
    fetchInitialData()
  }, [id])

  const fetchInitialData = async () => {
    setLoading(true)
    try {
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData.user?.id ?? null
      setCurrentUserId(userId)
      await loadElectionData(userId)
    } catch (error) {
      console.error("Error al arrancar detalle de elección:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadElectionData = async (userId: string | null) => {
    if (!id) return
    try {
      
      const repoData = await ElectionRepository.getSingleElectionDetails(id, userId)
      
      setElection(repoData.election)
      setPendingUsers(repoData.pendingUsers)

      if (repoData.voteData) {
        setHasVoted(repoData.voteData.vote === true)
        setHasRevealed(repoData.voteData.revealed === true)
        setUserSalt(repoData.voteData.salt)
        setSavedOptionIndex(repoData.voteData.option_index)
        setUserStatus(repoData.voteData.status || 'approved')
      } else {
        setUserStatus('none')
      }

      if ((repoData.election.status === 'reveal' || repoData.election.status === 'finished') && repoData.election.chain_election_id !== undefined) {
        const blockchainResults = await ElectionRepository.getBlockchainResults(repoData.election.chain_election_id)
        setResults(blockchainResults)
      }
    } catch (error) {
      console.error("No se pudo cargar la elección:", error)
    }
  }


  const handleRequestCensus = async () => {
    if (!currentUserId || !election) return
    try {
      await ElectionRepository.requestCensusInclusion(election.id, currentUserId)
      setUserStatus('pending')
      alert('🙋 Solicitud enviada al administrador.')
    } catch (error) {
      console.error("Error al solicitar censo:", error)
    }
  }

  const handleResolveUser = async (targetUserId: string, action: 'approved' | 'rejected') => {
    if (!election) return
    try {
      await ElectionRepository.updateCensusStatus(election.id, targetUserId, action)
      setPendingUsers(prev => prev.filter(u => u.user_id !== targetUserId))
    } catch (error) {
      console.error(`Error al ${action} usuario:`, error)
    }
  }


  const handleVote = async () => {
    if (!election || hasVoted || election.status !== 'active' || userStatus !== 'approved' || !currentUserId) return
    if (!selectedOptionId) { alert('Selecciona una opción'); return; }

    const optionIndex = election.options?.findIndex((o) => o.id === selectedOptionId)
    if (optionIndex === undefined || optionIndex === -1) return

    setIsVoting(true)
    try {
      
      const voteResult = await ElectionRepository.submitCommitVote(election.id, election.chain_election_id!, currentUserId, optionIndex)
      
      setHasVoted(true)
      setUserSalt(voteResult.salt)
      setSavedOptionIndex(voteResult.optionIndex)
      const txHash = voteResult.tx_hash
      console.log("Hash: ", txHash)
      if (txHash) {
        const quiereVerEtherscan = window.confirm(
          "✅ ¡Voto registrado en la Blockchain!\n\n" +
          "¿Ver en Etherscan?"
        );
        
        // Si el usuario hace clic en "Aceptar", abrimos la pestaña externa
        if (quiereVerEtherscan) {
          window.open(`https://sepolia.etherscan.io/tx/${txHash}`, '_blank', 'noopener,noreferrer');
        }
      } else {
        alert('✅ ¡Voto registrado en la Blockchain!!');
      }
    } catch (err) {
      console.error("Fallo al votar:", err)
      alert("No se pudo registrar el voto en la blockchain.")
    } finally {
      setIsVoting(false)
    }
  }

  const handleReveal = async () => {
    if (!election || !userSalt || savedOptionIndex === null || !currentUserId) return
    setIsRevealing(true)
    try {
      const { newWeb2Status, tx_hash } = await ElectionRepository.submitRevealVote(
        election.id, 
        election.chain_election_id!, 
        currentUserId, 
        savedOptionIndex, 
        userSalt
      )
      
      if (tx_hash) {
        const quiereVerEtherscan = window.confirm(
          "🔓 ¡Voto revelado y contabilizado en la Blockchain!\n\n" +
          "¿Ver en Etherscan?"
        );
        
        if (quiereVerEtherscan) {
          window.open(`https://sepolia.etherscan.io/tx/${tx_hash}`, '_blank', 'noopener,noreferrer');
        }
      } else {
        alert('🔓 ¡Voto revelado y contabilizado en la Blockchain!!');
      }
      
      setHasRevealed(true)
      setElection(prev => prev ? { ...prev, status: newWeb2Status } : null)
      await loadElectionData(currentUserId)

    } catch (err) {
      console.error("Error en el proceso de Reveal:", err)
      alert("No se pudo procesar la apertura de tu voto en la blockchain.")
    } finally {
      setIsRevealing(false)
    }
  }

  if (loading) return <p className="text-center mt-10">Cargando elección...</p>
  if (!election) return <p>No encontrada.</p>

  const isAdmin = currentUserId !== null && election.admin_id === currentUserId

  return (
    <div className="container" style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      
      {/* DETALLES */}
      <div className="mb-6" style={{ marginTop: '20px' }}>
        <h1 className="text-2xl font-bold">{election.title}</h1>
        <p>{election.description}</p>
        <p className="mt-2">Estado: <span className="status-badge" style={{fontWeight:'bold'}}>{election.status?.toUpperCase()}</span></p>
      </div>

      {/* ESTADO 1: INACTIVE (CENSO) */}
      {election.status === 'inactive' && (
        <div className="card text-center" style={{ border: '1px solid #ccc', padding: '20px', borderRadius: '8px' }}>
          <h2 style={{color: '#f59e0b'}}>⏳ Fase de Registro y Censo</h2>
          <p style={{color: '#cbd5e1', fontSize: '0.95em', marginTop: '5px'}}>La convocatoria pública está abierta. Revisa si tienes acceso a votar.</p>
          
          {userStatus === 'none' && !isAdmin && (
            <button 
              onClick={handleRequestCensus} 
              style={{ marginTop: '15px', padding: '10px 20px', backgroundColor: '#5B58F5', color: 'white', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
            >
              🙋 Solicitar inclusión en el censo
            </button>
          )}

          {userStatus === 'pending' && !isAdmin && (
            <p style={{ marginTop: '15px', color: '#d97706', fontWeight: 'bold' }}>
              ⏳ Has solicitado acceso. Esperando aprobación del administrador...
            </p>
          )}

          {userStatus === 'approved' && !isAdmin && (
            <p style={{ marginTop: '15px', color: '#00E676', fontWeight: 'bold' }}>
              ✅ Estás incluido en el censo oficial.
            </p>
          )}
        </div>
      )}

      {/* PANEL DE SOLICITUDES DE CENSO (SOLO ADMIN) */}
      {isAdmin && election.status === 'inactive' && pendingUsers.length > 0 && (
        <div className="card mb-6" style={{ border: '1px solid #f59e0b', padding: '20px', borderRadius: '8px', marginTop: '20px' }}>
          <h2 style={{ color: '#f59e0b', marginBottom: '15px' }}>🔔 Solicitudes de Censo Pendientes</h2>
          <ul style={{ listStyleType: 'none', padding: 0 }}>
            {pendingUsers.map(u => (
              <li key={u.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '10px', backgroundColor: '#1e293b', borderRadius: '6px' }}>
                <span style={{ color: 'white' }}>
                  {u.name ? `${u.name} (@${u.username})` : `@${u.username}` || 'Usuario anónimo'}
                </span>
                <div>
                  {/* 🟢 Pasamos a usar la función unificada handleResolveUser */}
                  <button onClick={() => handleResolveUser(u.user_id, 'approved')} style={{ backgroundColor: '#00E676', color: 'black', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginRight: '5px' }}>
                    ✓ Aprobar
                  </button>
                  <button onClick={() => handleResolveUser(u.user_id, 'rejected')} style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                    ✕ Rechazar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ESTADO 2: ACTIVE (COMMIT / URNA ABIERTA) */}
      {election.status === 'active' && (
        <div className="card mb-6" style={{ border: '1px solid #ccc', padding: '20px', borderRadius: '8px' }}>
          <h2 className="card-title" style={{ textAlign: 'center' }}>Selecciona una opción</h2>
          
          {userStatus !== 'approved' && !isAdmin ? (
            <p style={{ color: '#ef4444', fontWeight: 'bold', textAlign: 'center', marginTop: '10px' }}>
              ❌ No estás incluido en el censo de esta votación.
            </p>
          ) : hasVoted ? (
            <p style={{ color: '#00E676', fontWeight: 'bold', textAlign: 'center', marginTop: '10px' }}>🔒 Tu voto criptográfico está seguro en la Blockchain. Espera a la fase de recuento.</p>
          ) : (
            <div style={{marginTop: '15px'}}>
              {election.options?.map((option) => (
                <label key={option.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '12px', cursor: 'pointer' }}>
                  <input type="radio" name="voteOption" checked={selectedOptionId === option.id} onChange={() => setSelectedOptionId(option.id)} style={{ marginRight: '10px', width: '18px', height: '18px' }} />
                  <span style={{ color: 'white' }}>{option.option}</span>
                </label>
              ))}
              <button onClick={handleVote} disabled={isVoting || !selectedOptionId} className="btn-create" style={{ width: '100%', padding: '12px', borderRadius: '6px', fontWeight: 'bold', marginTop: '15px' }}>
                {isVoting ? '⏳ Cifrando y firmando...' : 'Emitir Voto Oculto (Commit)'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ESTADO 3: REVEAL (ABRIR SOBRES) */}
      {election.status === 'reveal' && (
        <div className="card mb-6" style={{ border: '1px solid #ccc', padding: '20px', borderRadius: '8px' }}>
          <h2 className="card-title" style={{ textAlign: 'center' }}>Fase de Revelación y Conteo</h2>
          {hasVoted && !hasRevealed ? (
            <div style={{ textAlign: 'center', marginTop: '10px' }}>
              <p style={{ marginBottom: '15px', color: '#cbd5e1' }}>Envía tu clave para validar tu voto.</p>
              <button onClick={handleReveal} disabled={isRevealing} style={{ width: '100%', padding: '12px', borderRadius: '6px', fontWeight: 'bold', backgroundColor: '#3b82f6', color: 'white', border: 'none', cursor: 'pointer' }}>
                {isRevealing ? '⏳ Descifrando...' : '🔓 Revelar mi Voto y Contar'}
              </button>
            </div>
          ) : (
            <div style={{marginTop: '15px'}}>
              <p style={{ color: '#00E676', fontWeight: 'bold', textAlign: 'center' }}>{hasRevealed ? '✅ ¡Tu sobre ha sido abierto con éxito!' : '🔒 No participaste en esta votación.'}</p>
              <h3 style={{marginTop: '20px', fontSize: '1.1em'}}>Recuento provisional en vivo:</h3>
              <ul style={{ listStyleType: 'none', padding: 0, marginTop: '10px' }}>
                {results.map((r) => <li key={r.candidate} style={{ color: '#ffffff' }}><strong>{r.candidate}</strong>: {r.votes} votos</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ESTADO 4: FINISHED (RESULTADOS BLINDADOS) */}
      {election.status === 'finished' && (
        <div className="card" style={{ border: '1px solid #ccc', padding: '20px', borderRadius: '8px' }}>
          <h2 className="card-title" style={{ textAlign: 'center', color: '#00E676' }}>Resultados Finales</h2>
          <ul style={{ listStyleType: 'none', padding: 0, marginTop: '15px' }}>
            {results.map((r) => <li key={r.candidate} style={{ fontSize: '1.1rem', color: '#ffffff', padding: '5px 0' }}><strong>{r.candidate}</strong>: {r.votes} votos</li>)}
          </ul>
        </div>
      )}

      {/* CONTROLES DE ADMINISTRADOR DE LA DEMO */}
      {isAdmin && election.status !== 'finished' && (
        <div className="mt-8 pt-6" style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #eee' }}>
          <button 
            disabled={changingStatus}
            onClick={async () => {
              setChangingStatus(true)
              try {
                // 🟢 Delegado al Repo
                const nextStatus = await ElectionRepository.forceAdvancePhase(election.id, election.chain_election_id!, election.status!)
                alert(`🚀 Elección movida a fase: ${nextStatus.toUpperCase()}`)
                await loadElectionData(currentUserId)
              } catch (err) {
                console.error(err)
              } finally {
                setChangingStatus(false)
              }
            }}
            style={{ width: '100%', padding: '12px', backgroundColor: '#e11d48', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            {changingStatus ? 'Cambiando fase electoral...' : `⏩ Forzar Avance de Fase (Actual: ${election.status?.toUpperCase()})`}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
        <button className="back-button" onClick={() => navigate('/')}>← Volver</button>
      </div>
    </div>
  )
}