import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useNavigate } from 'react-router-dom'
import { ElectionRepository } from './ElectionRepository'
import type { Election, User } from './ElectionRepository'
import './index.css'

const sortElections = (a: Election, b: Election) => {
  const statusOrder = { active: 0, inactive: 1, reveal: 2, finished: 3 }
  const statusA = statusOrder[a.status as keyof typeof statusOrder] ?? 4
  const statusB = statusOrder[b.status as keyof typeof statusOrder] ?? 4
  if (statusA !== statusB) return statusA - statusB
  return b.title.localeCompare(a.title)
}

export default function Home({
  showCreateForm,
  setShowCreateForm
}: {
  showCreateForm: boolean
  setShowCreateForm: React.Dispatch<React.SetStateAction<boolean>>
}) {
  const navigate = useNavigate()

  const [allElections, setAllElections] = useState<Election[]>([])
  const [userElections, setUserElections] = useState<Election[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all'|'active'|'inactive'|'reveal'|'finished'>('all')

  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newTopic, setNewTopic] = useState('')
  const [newOptions, setNewOptions] = useState<string[]>([''])
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [csvImportMessage, setCsvImportMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const usersPerPage = 15 
  const [isAdminUser, setIsAdminUser] = useState(false)

  const parseCSVValues = (content: string) => {
    const rows = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    if (rows.length === 0) return []
    const headerCells = rows[0].split(',').map(cell => cell.trim().toLowerCase())
    const emailIndex = headerCells.indexOf('email')
    const tokens: string[] = []

    if (emailIndex !== -1) {
      rows.slice(1).forEach(row => {
        const cells = row.split(',').map(cell => cell.trim())
        const email = cells[emailIndex]
        if (email) tokens.push(email.toLowerCase())
      })
    } else {
      rows.forEach(row => {
        row.split(',').map(cell => cell.trim()).filter(Boolean).forEach(cell => tokens.push(cell.toLowerCase()))
      })
    }
    return Array.from(new Set(tokens))
  }

  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async () => {
      const content = String(reader.result || '')
      const tokens = parseCSVValues(content)
      if (tokens.length === 0) {
        setCsvImportMessage('CSV vacío o sin valores válidos.')
        return
      }
      
      try {
        // Consumo del Repositorio para chequear el censo remoto
        const matchedUsers = await ElectionRepository.checkUsersByEmails(tokens)
        const matchedIds = matchedUsers.map((user: any) => user.id).filter(Boolean)
        
        setSelectedUserIds(prev => Array.from(new Set([...prev, ...matchedIds])))
        setCsvImportMessage(`Usuarios importados: ${matchedIds.length}. ${tokens.length - matchedIds.length > 0 ? `${tokens.length - matchedIds.length} no encontrados.` : 'Todos encontrados.'}`)
      } catch (error) {
        console.error('Error al cargar usuarios desde CSV:', error)
        setCsvImportMessage('Error en el servidor al validar el archivo.')
      }
    }
    reader.readAsText(file)
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id || null
      setCurrentUserId(userId)

      const repoResult = await ElectionRepository.getElectionsData(userId)
      
      setIsAdminUser(repoResult.isAdminUser)
      setUserElections(repoResult.visibleElections.sort(sortElections))
      setAllElections(repoResult.allElections)
    } catch (error) {
      console.error("Error cargando elecciones en controlador:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser()
      const currentUserId = userData.user?.id || null
      
      const availableUsers = await ElectionRepository.getAllUsers(currentUserId)
      setUsers(availableUsers)
    } catch (error) {
      console.error("Error cargando usuarios en controlador:", error)
      setUsers([])
    }
  }

  useEffect(() => {
    fetchData()
    fetchUsers()
  }, [])

  useEffect(() => {
    if (allElections.length === 0) setMessage('No hay elecciones disponibles')
    else if (allElections.length > 0 && userElections.length === 0)
      setMessage('No estás dentro de ninguna elección')
    else setMessage('')
  }, [allElections, userElections])

  const handleUserSelection = (id: string) => {
    setSelectedUserIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleOptionChangeInput = (index: number, value: string) => {
    const updated = [...newOptions]
    updated[index] = value
    setNewOptions(updated)
  }

  const addOption = () => setNewOptions(prev => [...prev, ''])
  const removeOption = (index: number) => setNewOptions(prev => prev.filter((_, i) => i !== index))

  
  const handleCreateElection = async () => {
    if (!newTitle) { alert('Introduce al menos el título'); return; }
    const validOptions = newOptions.filter(opt => opt.trim() !== '')
    if (validOptions.length < 2) { alert('La elección debe tener al menos dos opciones'); return; }

    setCreating(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) { alert('No se pudo obtener el usuario'); return; }

      
      const { chainElectionId, txHash } = await ElectionRepository.createElectionOnChain(newTitle, validOptions)

      
      await ElectionRepository.persistNewElection({
        title: newTitle,
        description: newDescription,
        topic: newTopic,
        adminId: userData.user.id,
        chainElectionId,
        selectedUserIds,
        validOptions,
        txHashCreate: txHash 
      })
      if (txHash) {
        const quiereVerEtherscan = window.confirm(
          "🎉 ¡Proceso electoral creado con éxito!\n\n" +
          "¿Ver en Etherscan?"
        );
        
        // Si pulsa 'Aceptar', abre la transacción en una pestaña nueva
        if (quiereVerEtherscan) {
          window.open(`https://sepolia.etherscan.io/tx/${txHash}`, '_blank', 'noopener,noreferrer');
        }
      } else {
        alert('🎉 ¡Proceso electoral creado con éxito!');
      }
      setShowCreateForm(false)
      setNewTitle(''); setNewDescription(''); setNewTopic(''); setNewOptions(['']); setSelectedUserIds([]); setCsvImportMessage('')
      fetchData()
      
    } catch (err) {
      console.error('Error en el flujo de creación estructurado:', err)
      alert('Ocurrió un error en la persistencia del flujo electoral.')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteElection = async (electionId: string) => {
    const confirmDelete = confirm('¿Seguro que quieres eliminar esta elección?')
    if (!confirmDelete) return
    try {
     
      await ElectionRepository.removeElection(electionId)
      alert('🗑️ Elección eliminada')
      fetchData()
    } catch (error) {
      alert('Error eliminando la elección o privilegios insuficientes.')
    }
  }

  const filteredUsers = users.filter(user => {
    const nombreCompleto = `${user.name || ''} ${user.surname || ''} ${user.username || ''}`.toLowerCase()
    return nombreCompleto.includes(searchTerm.toLowerCase())
  })

  const indexOfLastUser = currentPage * usersPerPage
  const indexOfFirstUser = indexOfLastUser - usersPerPage
  const currentUsersSlice = filteredUsers.slice(indexOfFirstUser, indexOfLastUser)
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage)

  useEffect(() => { setCurrentPage(1) }, [searchTerm])

  if (loading) return <p className="text-center mt-10">Cargando elecciones...</p>
  const filteredElections = userElections.filter((e) => filterStatus === 'all' ? true : e.status === filterStatus)

  return (
    <div className="container">
      <div className="header-container">
        {!showCreateForm && <h1 className="text-2xl font-bold">Elecciones disponibles</h1>}
        {!showCreateForm && isAdminUser && (
          <button onClick={() => setShowCreateForm(true)} className="btn-header btn-create">Crear elección</button>
        )}
      </div>

      {!showCreateForm && (
        <div className="filter-bar">
          <span className="filter-label">Filtrar Estado:</span>
          <div className="filter-buttons">
            {[
              { key: 'all', label: 'Todas' },
              { key: 'inactive', label: 'Censo (Inactivas)' },
              { key: 'active', label: 'Votación (Activas)' },
              { key: 'reveal', label: 'Recuento' },
              { key: 'finished', label: 'Finalizadas' }
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                className={`filter-button ${filterStatus === item.key ? 'active' : ''}`}
                onClick={() => setFilterStatus(item.key as any)}
                style={filterStatus === item.key ? { backgroundColor: '#5B58F5', color: '#ffffff', borderColor: '#5B58F5' } : {}}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showCreateForm && isAdminUser && (
        <div className="custom-card glass create-election-form">
          <button type="button" className="btn-delete-option close-card" onClick={() => setShowCreateForm(false)}>✕</button>
          <h2 className="card-title centered">Nueva elección (Modo Demo)</h2>
          <span className="section-label">Datos</span>
          <input type="text" placeholder="Título" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <textarea placeholder="Descripción" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
          <input type="text" placeholder="Tema" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} />

          <div className="section-label">Opciones</div>
          {newOptions.map((opt, index) => (
            <div key={index} className="option-item">
              <input type="text" placeholder={`Opción ${index + 1}`} value={opt} onChange={(e) => handleOptionChangeInput(index, e.target.value)} />
              {newOptions.length > 1 && (
                <button type="button" className="btn-danger btn-delete-option" onClick={() => removeOption(index)}>✕</button>
              )}
            </div>
          ))}

          <button className="btn-secondary section-button" onClick={addOption}>➕ Añadir opción</button>

          <div className="section-label">Cargar usuarios</div>
          <div className="csv-upload-row" style={{ marginBottom: '15px' }}>
            <label className="csv-label" htmlFor="csvUpload" style={{ display: 'inline-block', padding: '10px 15px', backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
              📥 Cargar archivo Censo (.csv)
            </label>
            <input id="csvUpload" type="file" accept=".csv,text/csv" onChange={handleCSVUpload} style={{ display: 'none' }} />
          </div>
          
          {csvImportMessage && <p className="csv-message" style={{ color: '#f59e0b', fontSize: '0.9em', marginBottom: '15px', fontWeight: 'bold' }}>{csvImportMessage}</p>}

          <div className="section-label">Usuarios del Sistema</div>
          {users.length === 0 ? (
            <p className="text-gray-500 text-sm">Cargando base de datos de usuarios...</p>
          ) : (
            <>
              <input
                type="text"
                placeholder="🔍 Buscar usuario por nombre, apellido o @username..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ marginBottom: '10px', padding: '10px', borderRadius: '6px', border: '1px solid #475569', backgroundColor: '#1e293b', color: 'white', width: '100%' }}
              />

              <div className="user-list user-list-tight" style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #334155', padding: '10px', borderRadius: '6px', backgroundColor: '#0f172a' }}>
                {currentUsersSlice.map(user => {
                  const displayName = user.name ? `${user.name} ${user.surname || ''}`.trim() : `@${user.username || user.id}`;
                  return (
                    <label key={user.id} className="user-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', padding: '4px 0', cursor: 'pointer' }}>
                      <input type="checkbox" checked={selectedUserIds.includes(user.id)} onChange={() => handleUserSelection(user.id)} className="w-4 h-4" style={{ marginRight: '10px' }} />
                      <span style={{ color: '#e2e8f0' }}>{displayName} {user.username && user.name ? `(@${user.username})` : ''}</span>
                    </label>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="pagination-controls" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '10px' }}>
                  <button type="button" disabled={currentPage === 1} onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} style={{ padding: '5px 12px', backgroundColor: currentPage === 1 ? '#334155' : '#5B58F5', color: 'white', border: 'none', borderRadius: '4px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontSize: '0.9em' }}>◀</button>
                  <span style={{ fontSize: '0.9em', color: '#cbd5e1' }}>Página <strong>{currentPage}</strong> de {totalPages}</span>
                  <button type="button" disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} style={{ padding: '5px 12px', backgroundColor: currentPage === totalPages ? '#334155' : '#5B58F5', color: 'white', border: 'none', borderRadius: '4px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', fontSize: '0.9em' }}>▶</button>
                </div>
              )}
            </>
          )}
          
          <div className="form-actions" style={{ marginTop: '20px' }}>
            <button className="btn-create btn-right" onClick={handleCreateElection} disabled={creating}>
              {creating ? 'Creando en Blockchain...' : 'Lanzar Convocatoria'}
            </button>
          </div>
        </div>
      )}

      {!showCreateForm && (
        <div className="cards-wrapper">
          {filteredElections.length === 0 ? (
            <p className="text-center text-gray-400 mt-6">No hay elecciones en esta categoría.</p>
          ) : (
            filteredElections.map((e) => {
              const isAdmin = currentUserId === e.admin_id;
              return (
                <div key={e.id} className="custom-card" style={{ position: 'relative' }} onClick={() => navigate(`/election/${e.id}`)}>
                  {isAdmin && isAdminUser && (
                    <button
                      type="button"
                      className="btn-danger btn-delete-option"
                      style={{ position: 'absolute', top: '15px', right: '15px', zIndex: 10, padding: '5px 10px', fontSize: '0.85em' }}
                      onClick={(ev) => { ev.stopPropagation(); handleDeleteElection(e.id); }}
                    >
                      🗑️
                    </button>
                  )}

                  <div className="card-header" style={{ paddingRight: isAdmin ? '80px' : '0px' }}>
                    <h2 className="card-title">{e.title}</h2>
                    <span className={`status-badge status-${e.status.toLowerCase()}`} style={{ fontWeight: 'bold' }}>{e.status.toUpperCase()}</span>
                  </div>
                  <p className="text-sm mb-4" style={{ color: '#94a3b8', marginTop: '8px' }}>{e.description}</p>
                  <div>
                    <button
                      onClick={(ev) => { ev.stopPropagation(); navigate(`/election/${e.id}`); }}
                      style={{
                        width: '100%', padding: '12px', borderRadius: '8px', fontWeight: 'bold', color: 'white', border: 'none', cursor: 'pointer',
                        backgroundColor: e.status === 'finished' ? '#475569' : e.status === 'reveal' ? '#3b82f6' : e.userStatus === 'pending' ? '#d97706' : e.hasVoted ? '#334155' : '#5B58F5',
                      }}
                    >
                      {e.status === 'finished' ? '📊 Ver Resultados' 
                        : e.status === 'reveal' ? '🔓 Abrir sobre (Reveal)' 
                        : e.userStatus === 'pending' ? '⏳ Solicitud Enviada (Ver detalles)'
                        : e.userStatus === 'none' ? '🙋 Solicitar Censo'
                        : e.hasVoted ? '✅ Ya has votado' 
                        : '🗳️ Entrar a Votar'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  )
}