import { create } from 'zustand'
import { GamePhase, Player, RoomPlayer } from '@/types/game'

interface GameState {
  roomId: string | null
  currentRound: number
  currentPhase: GamePhase
  myMoney: number
  myScore: number
  availablePlayers: Player[]
  selectedPlayers: Set<string>
  roomPlayers: RoomPlayer[]
  
  setRoom: (roomId: string) => void
  setPhase: (phase: GamePhase, round: number) => void
  setAvailablePlayers: (players: Player[]) => void
  togglePlayerSelection: (playerId: string) => void
  confirmDraft: () => void
}

export const useGameStore = create<GameState>((set, get) => ({
  roomId: null,
  currentRound: 1,
  currentPhase: 'income',
  myMoney: 0,
  myScore: 0,
  availablePlayers: [],
  selectedPlayers: new Set(),
  roomPlayers: [],
  
  setRoom: (roomId) => set({ roomId }),
  
  setPhase: (phase, round) => set({ 
    currentPhase: phase, 
    currentRound: round 
  }),
  
  setAvailablePlayers: (players) => set({ 
    availablePlayers: players,
    selectedPlayers: new Set()
  }),
  
  togglePlayerSelection: (playerId) => {
    const selected = new Set(get().selectedPlayers)
    if (selected.has(playerId)) {
      selected.delete(playerId)
    } else {
      selected.add(playerId)
    }
    set({ selectedPlayers: selected })
  },
  
  confirmDraft: () => {
    set({ currentPhase: 'settlement' })
  }
}))