import { supabase } from './supabaseClient'
import { ethers } from 'ethers'
import contractABI from '../artifacts/contracts/Voting.sol/Voting.json'
import contractAddress from './contracts/contract-address.json';

// 3. ¡Y listo! Ya tienes la dirección mapeada dinámicamente
const CONTRACT_ADDRESS = contractAddress.Voting;

// Tipados globales del dominio
export type Option = { id: string; election_id: string; option: string }
export type User = { id: string; username?: string; name?: string; surname?: string }
export type Election = {
  id: string
  title: string
  description: string
  status: string
  chain_election_id?: number
  admin_id?: string
  topic?: string
  options?: Option[]
  hasVoted?: boolean
  userStatus?: string
}
export type UserProfile = {
  id: string
  name: string | null
  surname: string | null
  username: string | null
  email: string
  created_at?: string
}
export type Result = { candidate: string; votes: number }

export const ElectionRepository = {
  
  // ==========================================
  // 🔗 1. CONEXIÓN BLOCKCHAIN INTERNA (v5)
  // ==========================================
  async getContract(signer?: any) {
    if (!(window as any).ethereum) throw new Error('MetaMask no está instalado')
    await (window as any).ethereum.request({ method: 'eth_requestAccounts' })
    const provider = new ethers.providers.Web3Provider((window as any).ethereum)

    const activeSigner = signer || provider.getSigner()
    return new ethers.Contract(CONTRACT_ADDRESS, contractABI.abi, activeSigner)
  },

  // ==========================================
  // 🏠 2. MÉTODOS DE LA PÁGINA PRINCIPAL (Home)
  // ==========================================
  async createElectionOnChain(title: string, candidates: string[]): Promise<{ chainElectionId: number; txHash: string }> {
    const contract = await this.getContract()
    const tx = await contract.createElection(title, candidates)
    const receipt = await tx.wait() // Espera síncrona clásica del bloque
    
    let chainElectionId = -1
    const event = receipt.events?.find((x: any) => x.event === 'ElectionCreated')
    
    if (event && event.args && event.args.electionId !== undefined) {
      chainElectionId = Number(event.args.electionId)
    } else {
      chainElectionId = Number(await contract.electionCount()) - 1
    }

    return {
      chainElectionId,
      txHash: tx.hash // Captura del hash transaccional original v5
    }
  },

  async checkUsersByEmails(tokens: string[]): Promise<any[]> {
    const { data, error } = await supabase.rpc("check_users", { emails: tokens })
    if (error) throw error
    return data || []
  },

  async getElectionsData(userId: string | null) {
    const { data: electionsData, error } = await supabase.from('elections').select('*')
    if (error) throw error
    const { data: optionsData } = await supabase.from('options').select('*').order('created_at', { ascending: true })
    
    const electionsWithOptions = (electionsData || []).map(election => ({
      ...election,
      status: election.status || 'inactive',
      options: optionsData?.filter(o => o.election_id === election.id),
      chain_election_id: election.chain_election_id
    }))

    let isAdminUser = false
    let visibleElections: Election[] = []

    if (userId) {
      const { data: profile } = await supabase.from('users').select('is_admin').eq('id', userId).single()
      isAdminUser = profile?.is_admin === true

      const { data: userElectionsData } = await supabase.from('user_election').select('election_id, vote, status').eq('user_id', userId)
      const userElectionMap = new Map<string, { vote: boolean, status: string }>()
      ;(userElectionsData || []).forEach((ue: any) => {
        userElectionMap.set(ue.election_id, { vote: ue.vote === true, status: ue.status || 'approved' })
      })

      visibleElections = electionsWithOptions.filter(e => userElectionMap.has(e.id) || e.status === 'inactive').map(e => ({
        ...e,
        hasVoted: userElectionMap.get(e.id)?.vote || false,
        userStatus: userElectionMap.get(e.id)?.status || 'none'
      }))
    }

    return { visibleElections, allElections: electionsWithOptions, isAdminUser }
  },

  async getAllUsers(currentUserId: string | null): Promise<User[]> {
    const { data, error } = await supabase.from('users').select('id, name, username, surname')
    if (error) throw error
    return (data || []).filter(u => u.id !== currentUserId)
  },

  async persistNewElection(payload: { 
    title: string; 
    description: string; 
    topic: string; 
    adminId: string; 
    chainElectionId: number; 
    selectedUserIds: string[]; 
    validOptions: string[];
    txHashCreate: string // Parámetro inyectado atómicamente
  }): Promise<void> {
    const { data, error } = await supabase.from('elections').insert({
        title: payload.title, 
        description: payload.description, 
        topic: payload.topic, 
        status: 'inactive', 
        admin_id: payload.adminId, 
        chain_election_id: payload.chainElectionId,
        tx_hash_create: payload.txHashCreate // Inserción limpia de golpe en Supabase
    }).select('id').single()
    if (error || !data) throw error

    const inserts = [...payload.selectedUserIds.map(user_id => ({ election_id: data.id, user_id, status: 'approved' })), { election_id: data.id, user_id: payload.adminId, status: 'approved' }]
    await supabase.from('user_election').insert(inserts)

    const optionsToInsert = payload.validOptions.map(opt => ({ election_id: data.id, option: opt }))
    await supabase.from('options').insert(optionsToInsert)
  },

  async removeElection(electionId: string): Promise<void> {
    const { error } = await supabase.from('elections').delete().eq('id', electionId)
    if (error) throw error
  },

  // ==========================================
  // 🗳️ 3. MÉTODOS DEL DETALLE DE ELECCIÓN 
  // ==========================================
  
  async getSingleElectionDetails(electionId: string, userId: string | null) {
    const { data, error } = await supabase.from('elections').select('*').eq('id', electionId).single()
    if (error || !data) throw new Error("Elección no encontrada")

    const { data: options } = await supabase.from('options').select('*').eq('election_id', electionId).order('created_at', { ascending: true })
    const election: Election = { ...data, options: options as Option[] }

    let voteData = null;
    let pendingUsers: any[] = [];

    if (userId) {
      const { data: vData } = await supabase.from('user_election').select('vote, salt, option_index, revealed, status').eq('election_id', electionId).eq('user_id', userId).single()
      voteData = vData || null;

      if (election.admin_id === userId) {
        const { data: pData } = await supabase.from('user_election').select('user_id, users(name, username, surname)').eq('election_id', electionId).eq('status', 'pending')
        if (pData) {
          pendingUsers = pData.map((pd: any) => ({
            user_id: pd.user_id,
            name: `${pd.users?.name || ''} ${pd.users?.surname || ''}`.trim(),
            username: pd.users?.username
          }))
        }
      }
    }
    return { election, voteData, pendingUsers }
  },

  async getBlockchainResults(chainElectionId: number): Promise<Result[]> {
    const contract = await this.getContract()
    const idBigInt = BigInt(chainElectionId)
    const votes: any = await contract.getResults(idBigInt)
    const candidates: any = await contract.getCandidates(idBigInt)

    if (!candidates || candidates.length === 0 || !votes) return []

    return candidates.map((candidate: string, index: number) => ({
      candidate,
      votes: votes[index] !== undefined ? Number(votes[index]) : 0
    }))
  },

  async requestCensusInclusion(electionId: string, userId: string) {
    const { error } = await supabase.from('user_election').insert({ election_id: electionId, user_id: userId, status: 'pending' })
    if (error) throw error
  },

  async updateCensusStatus(electionId: string, userId: string, newStatus: 'approved' | 'rejected') {
    if (newStatus === 'approved') {
      await supabase.from('user_election').update({ status: 'approved' }).eq('election_id', electionId).eq('user_id', userId)
    } else {
      await supabase.from('user_election').delete().eq('election_id', electionId).eq('user_id', userId)
    }
  },

  async submitCommitVote(electionId: string, chainElectionId: number, userId: string, optionIndex: number) {
    const salt = Math.random().toString(36).substring(2, 15)
    
    // 1. Cifrado y firma en Web3 (Mantenemos tu sintaxis v5 exacta)
    const commitHash = ethers.utils.solidityKeccak256(['uint256', 'string'], [optionIndex, salt])
    const contract = await this.getContract()
    const tx = await contract.vote(chainElectionId, commitHash)
    await tx.wait() // Espera secuencial del bloque

    // 2. Persistencia del secreto + HASH COMMIT en Web2
    const { error } = await supabase.from('user_election').update({ 
      vote: true, 
      salt: salt, 
      option_index: optionIndex,
      tx_hash_commit: tx.hash // Guardamos el hash inmutable
    }).eq('election_id', electionId).eq('user_id', userId)
    
    if (error) throw error

    return { salt, optionIndex, tx_hash: tx.hash }
  },

  async submitRevealVote(electionId: string, chainElectionId: number, userId: string, optionIndex: number, salt: string) {
    // 1. Descifrado en Web3
    const contract = await this.getContract()
    const tx = await contract.revealVote(chainElectionId, optionIndex, salt)
    await tx.wait() // Espera secuencial del bloque

    // 2. Sincronización de estado Web3 -> Web2 + HASH REVEAL
    const isStillActive = await contract.isActive(chainElectionId)
    const newWeb2Status = !isStillActive ? 'finished' : 'reveal'

    await supabase.from('user_election').update({ 
      revealed: true,
      tx_hash_reveal: tx.hash // Guardamos el hash inmutable
    }).eq('election_id', electionId).eq('user_id', userId)
    
    await supabase.from('elections').update({ status: newWeb2Status }).eq('id', electionId)

    return {newWeb2Status, tx_hash: tx.hash }
  },

  async forceAdvancePhase(electionId: string, chainElectionId: number, currentWeb2Status: string) {
    const contract = await this.getContract()
    const tx = await contract.advanceWorkflowStatus(chainElectionId)
    await tx.wait()

    let nextWeb2Status = 'active'
    if (currentWeb2Status === 'active') nextWeb2Status = 'reveal'
    if (currentWeb2Status === 'reveal') nextWeb2Status = 'finished'

    await supabase.from('elections').update({ status: nextWeb2Status }).eq('id', electionId)
    return nextWeb2Status
  },

  async uploadAvatar(userId: string, file: File): Promise<string> {
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const fileName = `${userId}.jpg`;

    let detectedMimeType = file.type;
    if (fileExt === 'jfif' || !detectedMimeType) {
      detectedMimeType = 'image/jpeg';
    }

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, { 
        cacheControl: '0', 
        upsert: true 
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
    return `${data.publicUrl}?t=${Date.now()}`;
  },

  async updateAvatarUrl(userId: string, avatarUrl: string): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({ avatar: avatarUrl }) 
      .eq('id', userId)

    if (error) {
      console.error("Error exacto al actualizar la tabla users:", error)
      throw error
    }
  },

  async getUserProfileAndStats(userId: string, email: string) {
    const { data: profileData, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (profileError) throw profileError

    const { data: userCensuses, error: censusError } = await supabase
      .from('user_election')
      .select(`
        vote,
        revealed,
        elections!inner ( status )
      `)
      .eq('user_id', userId)

    if (censusError) throw censusError

    const totalCensusedElections = userCensuses || []

    let activeElectionsCount = 0
    let pendingVotesCount = 0 
    let completedVotesCount = 0 
    let lostVotesCount = 0 

    totalCensusedElections.forEach((ue: any) => {
      const status = ue.elections?.status

      if (status === 'active') {
        activeElectionsCount++
        if (ue.vote === true) {
          pendingVotesCount++
        }
      } else if (status === 'reveal') {
        if (ue.revealed === true) completedVotesCount++
      } else if (status === 'finished') {
        if (ue.revealed === true) {
          completedVotesCount++
        } else if (ue.vote === true && ue.revealed !== true) {
          lostVotesCount++
        }
      }
    })

    const totalParticipated = totalCensusedElections.filter((ue: any) => ue.vote === true).length
    const totalElectionsCensused = totalCensusedElections.length
    const participationRate = totalElectionsCensused > 0 
      ? Math.round((totalParticipated / totalElectionsCensused) * 100) 
      : 0

    return {
      profile: {
        ...profileData,
        email: email
      },
      stats: {
        activeElectionsCount,
        pendingVotesCount,
        completedVotesCount,
        lostVotesCount,
        participationRate,
        totalElectionsCensused
      }
    }
  }
}