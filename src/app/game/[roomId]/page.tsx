'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'

const SEASON_COST_RANGE: { [round: number]: number[] } = {
  1: [0, 1, 2], 2: [0, 1, 2, 3], 3: [0, 1, 2, 3, 4],
  4: [0, 1, 2, 3, 4, 5, 6, 7], 5: [2, 3, 4, 5, 6, 7],
  6: [3, 4, 5, 6, 7], 7: [4, 5, 6, 7],
}

const SEASON_COST_LABELS: { [round: number]: string } = {
  1: '0~2费', 2: '0~3费', 3: '0~4费', 4: '0~7费',
  5: '2~7费', 6: '3~7费', 7: '4~7费',
}

const MAX_ROSTER_SIZE = 11

function getBonusScore(round: number, rank: number): number {
  if (round <= 4) return { 1: 10, 2: 8, 3: 6, 4: 4, 5: 2, 6: 0 }[rank] || 0
  if (round <= 6) return { 1: 15, 2: 12, 3: 9, 4: 6, 5: 3, 6: 0 }[rank] || 0
  return { 1: 20, 2: 16, 3: 12, 4: 8, 5: 4, 6: 0 }[rank] || 0
}

export default function GamePage() {
  const params = useParams()
  const router = useRouter()
  const roomId = params.roomId as string

  const [userProfile, setUserProfile] = useState<any>(null)
  const [room, setRoom] = useState<any>(null)
  const [myData, setMyData] = useState<any>(null)
  const [message, setMessage] = useState('')

  const [availablePlayers, setAvailablePlayers] = useState<any[]>([])
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set())
  const [myDraftedPlayers, setMyDraftedPlayers] = useState<any[]>([])
  const [finalSelected, setFinalSelected] = useState<Set<string>>(new Set())
  const [hasFinalized, setHasFinalized] = useState(false)
  const [showReleaseConfirm, setShowReleaseConfirm] = useState<string | null>(null)
  const [showFinalConfirm, setShowFinalConfirm] = useState(false)
  const spawnedPlayerIdsRef = useRef<Set<string>>(new Set())
  const initialLoadDoneRef = useRef(false)
  const playersLoadedForRoundRef = useRef<number>(0)

  const [showInterestPopup, setShowInterestPopup] = useState(false)
  const [interestAmount, setInterestAmount] = useState(0)
  const [showResultPopup, setShowResultPopup] = useState(false)
  const [resultData, setResultData] = useState<any>(null)

  useEffect(() => {
    const userStr = localStorage.getItem('currentUser')
    if (!userStr) { router.push('/'); return }
    const user = JSON.parse(userStr)
    setUserProfile(user)
    if (user.role === 'gm') { router.push(`/game/${roomId}/gm`); return }
    loadCachedPlayers()
    fetchGameData(user.id)
    const interval = setInterval(() => fetchGameData(user.id), 8000)
    return () => clearInterval(interval)
  }, [])

  const loadCachedPlayers = () => {
    const cacheKey = `draft_${roomId}_${room?.current_round || 1}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      try {
        const ids = JSON.parse(cached) as string[]
        if (ids.length > 0) {
          supabase.from('players_pool').select('*').in('id', ids).then(({ data }) => {
            if (data && data.length > 0) { spawnedPlayerIdsRef.current = new Set(data.map((p: any) => p.id)); setAvailablePlayers(data) }
          })
        }
      } catch { localStorage.removeItem(cacheKey) }
    }
  }

  const fetchGameData = async (userId: string) => {
    const { data: roomData } = await supabase.from('game_rooms').select('*').eq('id', roomId).single()
    setRoom(roomData)
    const { data: playerData } = await supabase.from('room_players').select('*').eq('room_id', roomId).eq('user_id', userId).single()
    setMyData(playerData)
    if (roomData && playerData) checkResultPopup(roomData, playerData)
    if (roomData?.current_phase === 'draft') {
      await supabase.from('draft_records').update({ status: 'drafted' }).eq('room_id', roomId).eq('user_id', userId).eq('status', 'final').lt('round', roomData.current_round)
      await fetchDraftData(userId, roomData.current_round)
    } else if (roomData?.current_phase === 'match') {
      await fetchDraftData(userId, roomData.current_round)
      setAvailablePlayers([])
    } else {
      setHasFinalized(false); initialLoadDoneRef.current = false; playersLoadedForRoundRef.current = 0
      setAvailablePlayers([]); setSelectedPlayers(new Set()); setFinalSelected(new Set())
    }
  }

  const checkResultPopup = async (roomData: any, playerData: any) => {
    const { data: rankings } = await supabase.from('round_rankings').select('*').eq('room_id', roomId).order('round', { ascending: true })
    if (!rankings || rankings.length === 0) return
    const lastSeenRound = playerData.last_seen_result_round || 0
    const bonusMoneyMap: any = { 1: 8, 2: 7, 3: 7, 4: 6, 5: 6, 6: 5 }
    for (const ranking of rankings) {
      if (ranking.round > lastSeenRound) {
        const { data: allPlayers } = await supabase.from('room_players').select(`*, users:user_id (username)`).eq('room_id', roomId)
        const ranks = ranking.rankings as { [userId: string]: number }
        const playerResults = (allPlayers || []).map((p: any) => ({
          username: p.users?.username, rank: ranks[p.user_id] || 99,
          bonusMoney: bonusMoneyMap[ranks[p.user_id]] || 5,
          bonusScore: getBonusScore(ranking.round, ranks[p.user_id] || 6),
        })).sort((a: any, b: any) => a.rank - b.rank)
        setResultData({ round: ranking.round, players: playerResults }); setShowResultPopup(true); break
      }
    }
  }

  const dismissResultPopup = async () => {
    setShowResultPopup(false)
    if (resultData && myData) await supabase.from('room_players').update({ last_seen_result_round: resultData.round }).eq('id', myData.id)
  }

  const fetchDraftData = async (userId: string, round: number) => {
    const { data: drafted } = await supabase.from('draft_records')
      .select(`id, status, round, player_id, players_pool:player_id (id, name, cost)`)
      .eq('room_id', roomId).eq('user_id', userId).in('status', ['drafted', 'final']).order('round', { ascending: true })
    const all = drafted || []
    setMyDraftedPlayers(all.filter((r: any) => r.player_id !== null))
    const hasFinal = all.some((r: any) => r.status === 'final')
    setHasFinalized(hasFinal)
    if (!initialLoadDoneRef.current) setFinalSelected(hasFinal ? new Set(all.filter((r: any) => r.status === 'final').map((r: any) => r.id)) : new Set())
    initialLoadDoneRef.current = true
    if (playersLoadedForRoundRef.current !== round && !hasFinal && availablePlayers.length === 0) {
      playersLoadedForRoundRef.current = round
      const cacheKey = `draft_${roomId}_${round}`
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        try {
          const ids = JSON.parse(cached) as string[]
          if (ids.length > 0) {
            const { data: players } = await supabase.from('players_pool').select('*').in('id', ids)
            if (players && players.length > 0) { spawnedPlayerIdsRef.current = new Set(players.map((p: any) => p.id)); setAvailablePlayers(players); return }
          }
        } catch { localStorage.removeItem(cacheKey) }
      }
      await refreshPlayers(false, round)
    }
  }

  const refreshPlayers = async (isManualRefresh: boolean, round?: number) => {
    const currentRound = round || room?.current_round || 1
    const cacheKey = `draft_${roomId}_${currentRound}`
    const { data: roomData } = await supabase.from('game_rooms').select('gm_id').eq('id', roomId).single()
    if (!roomData) return
    if (isManualRefresh) { for (const pid of spawnedPlayerIdsRef.current) await supabase.from('players_pool').update({ status: 'available' }).eq('id', pid); spawnedPlayerIdsRef.current = new Set(); localStorage.removeItem(cacheKey) }
    const allowedCosts = SEASON_COST_RANGE[currentRound] || [0,1,2,3,4,5,6,7]
    const { data: poolPlayers } = await supabase.from('players_pool').select('*').eq('gm_id', roomData.gm_id).eq('status', 'available').in('cost', allowedCosts)
    if (poolPlayers && poolPlayers.length > 0) {
      const shuffled = [...poolPlayers].sort(() => Math.random() - 0.5); const selected = shuffled.slice(0, 5)
      const newSpawnedIds = new Set<string>()
      for (const p of selected) { await supabase.from('players_pool').update({ status: 'in_pool' }).eq('id', p.id); newSpawnedIds.add(p.id) }
      spawnedPlayerIdsRef.current = newSpawnedIds; setAvailablePlayers(selected); localStorage.setItem(cacheKey, JSON.stringify(selected.map((p: any) => p.id)))
    } else { setAvailablePlayers([]); localStorage.removeItem(cacheKey) }
    setSelectedPlayers(new Set())
  }

  const manualRefresh = async () => {
    if ((myData?.money || 0) < 2) { setMessage('余额不足，需要2元'); return }
    await supabase.from('room_players').update({ money: (myData.money || 0) - 2 }).eq('id', myData.id)
    await refreshPlayers(true, room?.current_round); await fetchGameData(userProfile.id)
  }

  const togglePlayer = (playerId: string) => setSelectedPlayers(prev => { const ns = new Set(prev); ns.has(playerId) ? ns.delete(playerId) : ns.add(playerId); return ns })
  const totalCost = Array.from(selectedPlayers).reduce((sum, playerId) => sum + (availablePlayers.find(p => p.id === playerId)?.cost || 0), 0)

  const confirmDraft = async () => {
    if (selectedPlayers.size === 0) { setMessage('请至少选择一名球员'); return }
    if (totalCost > (myData?.money || 0)) { setMessage('余额不足！'); return }
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}')
    const sids = Array.from(selectedPlayers)
    const { error } = await supabase.from('draft_records').insert(sids.map(pid => ({ room_id: roomId, user_id: user.id, player_id: pid, round: room.current_round, status: 'drafted' })))
    if (error) { setMessage('购买失败: ' + error.message); return }
    for (const pid of sids) await supabase.from('players_pool').update({ status: 'drafted' }).eq('id', pid)
    await supabase.from('room_players').update({ money: (myData.money || 0) - totalCost }).eq('id', myData.id)
    setAvailablePlayers(prev => { const r = prev.filter(p => !sids.includes(p.id)); localStorage.setItem(`draft_${roomId}_${room?.current_round}`, JSON.stringify(r.map((p: any) => p.id))); return r })
    spawnedPlayerIdsRef.current = new Set(Array.from(spawnedPlayerIdsRef.current).filter(id => !sids.includes(id)))
    setSelectedPlayers(new Set()); setMessage(`购买成功！花费${totalCost}元`); await fetchGameData(user.id)
  }

  const releasePlayer = async (recordId: string, playerId: string, playerCost: number) => {
    const refund = Math.max(1, playerCost - 1)
    await supabase.from('draft_records').update({ status: 'released' }).eq('id', recordId)
    await supabase.from('players_pool').update({ status: 'available' }).eq('id', playerId)
    await supabase.from('room_players').update({ money: (myData.money || 0) + refund }).eq('id', myData.id)
    setFinalSelected(prev => { const ns = new Set(prev); ns.delete(recordId); return ns })
    setMessage(`已遣散，返还${refund}元`); setShowReleaseConfirm(null); await fetchGameData(userProfile.id)
  }

  const toggleFinal = (recordId: string) => setFinalSelected(prev => { const ns = new Set(prev); if (ns.has(recordId)) ns.delete(recordId); else { if (ns.size >= MAX_ROSTER_SIZE) { setMessage(`最多${MAX_ROSTER_SIZE}人`); return prev } ns.add(recordId) } return ns })
  const toggleSelectAll = () => { const s = myDraftedPlayers.filter((r: any) => r.status === 'drafted'); if (s.length === 0) return; const m = Math.min(s.length, MAX_ROSTER_SIZE); setFinalSelected(prev => prev.size === m ? new Set() : new Set(s.slice(0, MAX_ROSTER_SIZE).map((r: any) => r.id))) }
  const confirmFinalRoster = () => setShowFinalConfirm(true)

  const executeFinalRoster = async () => {
    const currentRound = room?.current_round
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}')
    for (const pid of spawnedPlayerIdsRef.current) await supabase.from('players_pool').update({ status: 'available' }).eq('id', pid)
    spawnedPlayerIdsRef.current = new Set(); localStorage.removeItem(`draft_${roomId}_${currentRound}`)
    await supabase.from('draft_records').delete().eq('room_id', roomId).eq('user_id', user.id).eq('round', currentRound).eq('status', 'final')
    if (finalSelected.size === 0) {
      await supabase.from('draft_records').insert({ room_id: roomId, user_id: user.id, player_id: null, round: currentRound, status: 'final' })
    } else {
      for (const record of myDraftedPlayers.filter((r: any) => r.status === 'drafted')) {
        if (finalSelected.has(record.id)) await supabase.from('draft_records').update({ status: 'final', round: currentRound }).eq('id', record.id)
      }
    }
    const interest = Math.floor((myData?.money || 0) / 5)
    if (interest > 0) await supabase.from('room_players').update({ money: (myData.money || 0) + interest }).eq('id', myData.id)
    setInterestAmount(interest); setShowInterestPopup(true); setHasFinalized(true); setShowFinalConfirm(false)
    setAvailablePlayers([]); setSelectedPlayers(new Set()); await fetchGameData(user.id)
  }

  const phaseLabel = (phase: string) => { const m: any = { draft: '选秀阶段', match: '比赛阶段' }; return m[phase] || phase }
  if (!userProfile || !room || !myData) return <div className="min-h-screen bg-white flex items-center justify-center"><p className="text-gray-500">加载中...</p></div>

  return (
    <div className="min-h-screen bg-white">
      {showInterestPopup && (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full mx-4 text-center"><div className="text-4xl mb-4">💰</div><h3 className="text-lg font-semibold text-gray-900 mb-2">利息结算</h3>{interestAmount > 0 ? <p className="text-gray-600 mb-4">获得了 <span className="text-red-600 font-bold text-xl">{interestAmount}</span> 元利息</p> : <p className="text-gray-600 mb-4">余额不足5元，未获得利息</p>}<p className="text-xs text-gray-400 mb-4">（每剩余5元获得1元利息）</p><button onClick={() => setShowInterestPopup(false)} className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">确定</button></div></div>)}
      {showResultPopup && resultData && (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full mx-4 max-h-[80vh] overflow-y-auto"><h3 className="text-lg font-semibold text-gray-900 mb-1 text-center">比赛结果</h3><p className="text-xs text-gray-400 text-center mb-4">S{resultData.round} 赛季</p><div className="space-y-2 mb-4">{resultData.players.map((p: any, i: number) => (<div key={i} className="flex items-center justify-between bg-gray-50 p-2 rounded"><div className="flex items-center gap-2"><span className="font-bold text-red-600 w-6">#{p.rank}</span><span className="text-sm text-gray-900">{p.username}</span></div><span className="text-xs text-gray-500">+{p.bonusMoney}元 +{p.bonusScore}分</span></div>))}</div><button onClick={dismissResultPopup} className="w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">确定</button></div></div>)}
      <div className="border-b border-gray-200 bg-red-50"><div className="max-w-2xl mx-auto px-8 py-4 flex justify-between items-center"><div><h1 className="text-lg font-bold text-red-700">{room.name || '游戏局'}</h1><p className="text-sm text-gray-500">第 {room.current_round}/7 赛季 · {phaseLabel(room.current_phase)}</p></div><div className="flex items-center gap-4"><div className="text-right"><p className="text-sm text-gray-500">{userProfile.username}</p><p className="text-lg font-bold text-red-600">💰{myData.money}元 ⭐{myData.score}分</p></div><button onClick={() => router.push('/dashboard')} className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 text-sm">退出</button></div></div></div>
      <div className="max-w-2xl mx-auto px-8 py-6">
        {message && <div className={`mb-4 p-3 rounded text-sm ${message.includes('成功') || message.includes('已') ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>{message}<button onClick={() => setMessage('')} className="ml-2 underline">关闭</button></div>}
        {showFinalConfirm && (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full mx-4"><h3 className="text-lg font-semibold text-gray-900 mb-2">确认大名单</h3><p className="text-gray-600 mb-1">确定提交大名单吗？（{finalSelected.size}人）</p><p className="text-gray-500 text-sm mb-4">确定后本季将无法再选秀</p><div className="flex gap-2 justify-end"><button onClick={() => setShowFinalConfirm(false)} className="px-4 py-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50">取消</button><button onClick={executeFinalRoster} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">确认</button></div></div></div>)}

        {/* 选秀阶段 - 未提交大名单 */}
        {room.current_phase === 'draft' && !hasFinalized && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">队伍操作</h2>
              {myDraftedPlayers.filter((r: any) => r.status === 'drafted').length > 0 ? (
                <div className="space-y-2">
                  {myDraftedPlayers.filter((r: any) => r.status === 'drafted').map((record: any) => (
                    <div key={record.id} onClick={() => toggleFinal(record.id)} className={`flex items-center justify-between p-3 rounded border cursor-pointer transition-all ${finalSelected.has(record.id) ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}>
                      <div className="flex items-center gap-3">
                        <input type="checkbox" checked={finalSelected.has(record.id)} onChange={() => {}} className="accent-red-600 w-4 h-4" />
                        <span className="text-sm text-gray-900">{record.players_pool?.name}</span>
                        <span className="text-xs text-gray-500">({record.players_pool?.cost}费)</span>
                        {record.round !== room?.current_round && <span className="text-xs text-gray-400">S{record.round}</span>}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); setShowReleaseConfirm(record.id) }} className="px-3 py-1 text-xs border border-red-300 text-red-500 rounded hover:bg-red-50 transition-colors">遣散</button>
                    </div>
                  ))}
                </div>
              ) : <p className="text-gray-400 text-sm py-2">暂无球员</p>}
              <div className="flex items-center justify-between mt-3">
                {myDraftedPlayers.filter((r: any) => r.status === 'drafted').length > 0 && (
                  <button onClick={toggleSelectAll} className="text-xs text-red-500 hover:text-red-700">{finalSelected.size === Math.min(myDraftedPlayers.filter((r: any) => r.status === 'drafted').length, MAX_ROSTER_SIZE) ? '取消全选' : `全选(最多${MAX_ROSTER_SIZE})`}</button>
                )}
                <div className="flex-1" />
              </div>
              {showReleaseConfirm && (() => { const r = myDraftedPlayers.find(x => x.id === showReleaseConfirm); const refund = Math.max(1, (r?.players_pool?.cost || 0) - 1); return (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full mx-4"><h3 className="text-lg font-semibold text-gray-900 mb-2">确认遣散</h3><p className="text-gray-600 mb-1">确定遣散 <span className="text-red-600 font-medium">{r?.players_pool?.name}</span> 吗？</p><p className="text-gray-500 text-sm mb-4">将返还 {refund} 元</p><div className="flex gap-2 justify-end"><button onClick={() => setShowReleaseConfirm(null)} className="px-4 py-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50">取消</button><button onClick={() => releasePlayer(r.id, r.players_pool?.id, r.players_pool?.cost || 0)} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">确认遣散</button></div></div></div>) })()}
              <button onClick={confirmFinalRoster} className="mt-3 w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition-colors">选定大名单 ({finalSelected.size}人)</button>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">选秀</h2>
              <p className="text-gray-500 text-xs mb-3">S{room.current_round} 可选：{SEASON_COST_LABELS[room.current_round] || '全费用'}（{SEASON_COST_RANGE[room.current_round]?.join('、')}费）</p>
              <details className="text-xs text-gray-400 mb-3"><summary className="cursor-pointer hover:text-gray-500">查看所有赛季费用</summary><div className="mt-1 space-y-0.5 bg-gray-50 p-2 rounded">{[1,2,3,4,5,6,7].map(s => (<div key={s} className={s === room.current_round ? 'text-red-600 font-medium' : ''}>S{s}：{SEASON_COST_LABELS[s]}（{SEASON_COST_RANGE[s]?.join('、')}费）</div>))}</div></details>
              <div className="flex justify-end mb-3"><button onClick={manualRefresh} disabled={(myData?.money || 0) < 2} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors">刷新 (2元)</button></div>
              {availablePlayers.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {availablePlayers.map((p: any) => (
                    <div key={p.id} onClick={() => togglePlayer(p.id)} className={`flex items-center justify-between p-3 rounded border cursor-pointer transition-all ${selectedPlayers.has(p.id) ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}>
                      <div className="flex items-center gap-3"><input type="checkbox" checked={selectedPlayers.has(p.id)} onChange={() => {}} className="accent-red-600 w-4 h-4" /><span className="text-sm text-gray-900">{p.name}</span></div>
                      <span className="text-red-600 font-bold">{p.cost}元</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-gray-400 text-center py-4"></p>}
              {selectedPlayers.size > 0 && (<div className="border-t border-gray-200 pt-4"><div className="flex justify-between items-center mb-3"><span className="text-gray-600">已选 {selectedPlayers.size} 人</span><span className="text-lg font-bold text-red-600">合计: {totalCost}元</span></div><button onClick={confirmDraft} disabled={totalCost > (myData.money || 0)} className="w-full py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors">{totalCost > (myData.money || 0) ? '余额不足' : '购买'}</button></div>)}
            </div>
          </div>
        )}

        {/* 选秀阶段 - 已提交大名单 */}
        {room.current_phase === 'draft' && hasFinalized && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">我的队伍</h2>
            <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">大名单已确定</div>
            {myDraftedPlayers.length === 0 ? <p className="text-gray-400 text-sm py-2">空大名单</p> : (
              <div className="space-y-2">
                {myDraftedPlayers.map((record: any) => (
                  <div key={record.id} className={`flex items-center p-3 rounded border ${record.status === 'final' ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                    <span className="text-sm text-gray-900">{record.players_pool?.name}</span>
                    <span className="text-xs text-gray-500 ml-2">({record.players_pool?.cost}费)</span>
                    {record.status === 'final' && <span className="text-xs text-red-600 font-medium ml-2">大名单</span>}
                    {record.round !== room?.current_round && <span className="text-xs text-gray-400 ml-2">S{record.round}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 比赛阶段 */}
        {room.current_phase === 'match' && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">我的队伍</h2>
              {myDraftedPlayers.length === 0 ? <p className="text-gray-400 text-sm py-2">暂无球员</p> : (
                <div className="space-y-2">
                  {myDraftedPlayers.map((record: any) => (
                    <div key={record.id} className={`flex items-center p-3 rounded border ${record.status === 'final' ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                      <span className="text-sm text-gray-900">{record.players_pool?.name}</span>
                      <span className="text-xs text-gray-500 ml-2">({record.players_pool?.cost}费)</span>
                      {record.status === 'final' && <span className="text-xs text-red-600 font-medium ml-2">大名单</span>}
                      {record.round !== room?.current_round && <span className="text-xs text-gray-400 ml-2">S{record.round}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
              <div className="text-4xl mb-4">⚽</div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">比赛阶段</h2>
              <p className="text-gray-500 mb-4">等待GM公布比赛结果...</p>
              <div className="bg-gray-50 rounded-lg p-4 text-left">
                <p className="text-sm font-medium text-gray-700 mb-2">S{room.current_round} 排名奖励明细</p>
                <div className="grid grid-cols-7 gap-1 text-xs text-gray-600 mb-1">
                  <span>排名</span><span className="text-center font-medium">#1</span><span className="text-center font-medium">#2</span><span className="text-center font-medium">#3</span><span className="text-center font-medium">#4</span><span className="text-center font-medium">#5</span><span className="text-center font-medium">#6</span>
                </div>
                <div className="grid grid-cols-7 gap-1 text-xs text-gray-600 mb-1">
                  <span>奖金</span><span className="text-center">+8元</span><span className="text-center">+7元</span><span className="text-center">+7元</span><span className="text-center">+6元</span><span className="text-center">+6元</span><span className="text-center">+5元</span>
                </div>
                <div className="grid grid-cols-7 gap-1 text-xs text-gray-600">
                  <span>分数</span>
                  {[1,2,3,4,5,6].map(r => (<span key={r} className="text-center">+{getBonusScore(room.current_round, r)}分</span>))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}