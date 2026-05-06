export type GamePhase = 'income' | 'draft' | 'settlement'
export type GameStatus = 'waiting' | 'playing' | 'finished'

export interface Player {
  id: string
  name: string
  cost: number
  isDrafted: boolean
}

export interface RoomPlayer {
  userId: string
  username: string
  money: number
  score: number
  isReady: boolean
}

export interface GameRoom {
  id: string
  gmId: string
  status: GameStatus
  currentRound: number
  currentPhase: GamePhase
}