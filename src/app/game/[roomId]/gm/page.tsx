'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'

function getBonusScore(round: number, rank: number): number {
  if (round <= 4) return { 1: 10, 2: 8, 3: 6, 4: 4, 5: 2, 6: 0 }[rank] || 0
  if (round <= 6) return { 1: 15, 2: 12, 3: 9, 4: 6, 5: 3, 6: 0 }[rank] || 0
  return { 1: 20, 2: 16, 3: 12, 4: 8, 5: 4, 6: 0 }[rank] || 0
}

export default function GMGamePage() {
  const params = useParams()
  const router = useRouter()
  const roomId = params.roomId as string

  const [userProfile, setUserProfile] = useState<any>(null)
  const [room, setRoom] = useState<any>(null)
  const [players, setPlayers] = useState<any[]>([])
  const [message, setMessage] = useState('')
  const [draftedPlayers, setDraftedPlayers] = useState<any[]>([])

  const isMountedRef = useRef(true)
  const [showRanking, setShowRanking] = useState(false)
  const [rankings, setRankings] = useState<{ [userId: string]: number }>({})
  const [finalRanking, setFinalRanking] = useState<any[]>([])

  useEffect(() => {
    isMountedRef.current = true
    const userStr = localStorage.getItem('currentUser')
    if (!userStr) { router.push('/'); return }
    const user = JSON.parse(userStr)
    if (user.role !== 'gm') { router.push('/dashboard'); return }
    setUserProfile(user)
    fetchGameData()
    const interval = setInterval(() => { if (isMountedRef.current) fetchGameData() }, 3000)
    return () => { isMountedRef.current = false; clearInterval(interval) }
  }, [])

  const fetchGameData = async () => {
    const { data: roomData } = await supabase.from('game_rooms').select('*').eq('id', roomId).single()
    if (!isMountedRef.current) return
    setRoom(roomData)
    const { data: playerData } = await supabase.from('room_players').select(`*, users:user_id (username)`).eq('room_id', roomId)
    if (!isMountedRef.current) return
    setPlayers(playerData || [])

    if (roomData?.status === 'finished') {
      if (playerData) setFinalRanking([...playerData].sort((a, b) => (b.score || 0) - (a.score || 0) || (b.money || 0) - (a.money || 0)))
      return
    }

    if (roomData) {
      const { data: drafted } = await supabase.from('draft_records')
        .select(`*, players_pool:player_id (id, name, cost), users:user_id (username)`)
        .eq('room_id', roomId).in('status', ['drafted', 'final']).order('round', { ascending: true })
      if (isMountedRef.current) setDraftedPlayers(drafted || [])
    }
  }

  const allPlayersFinalized = () => {
    if (!players || players.length === 0) return false
    const g: any = {}; draftedPlayers.forEach(r => { if (!g[r.user_id]) g[r.user_id] = []; g[r.user_id].push(r) })
    return players.every(p => (g[p.user_id] || []).some((r: any) => r.status === 'final' && r.round === room?.current_round))
  }

  const enterMatchPhase = async () => {
    await supabase.from('game_rooms').update({ current_phase: 'match' }).eq('id', roomId)
    setMessage('已进入比赛阶段'); await fetchGameData()
  }

  const openRanking = () => {
    const init: { [userId: string]: number } = {}
    players.forEach((p, i) => { init[p.user_id] = i + 1 })
    setRankings(init); setShowRanking(true)
  }

  const submitRankings = async () => {
    const bonusMoneyMap: { [rank: number]: number } = { 1: 8, 2: 7, 3: 7, 4: 6, 5: 6, 6: 5 }
    const currentRound = room?.current_round || 1
    for (const [userId, rank] of Object.entries(rankings)) {
      const bonusM = bonusMoneyMap[rank] || 5
      const bonusS = getBonusScore(currentRound, rank)
      const { data: rp } = await supabase.from('room_players').select('*').eq('room_id', roomId).eq('user_id', userId).single()
      if (rp) await supabase.from('room_players').update({ money: (rp.money || 0) + bonusM, score: (rp.score || 0) + bonusS }).eq('id', rp.id)
    }
    await supabase.from('round_rankings').insert({ room_id: roomId, round: currentRound, rankings })
    const next = currentRound + 1
    if (next > 7) {
      await supabase.from('game_rooms').update({ status: 'finished' }).eq('id', roomId)
      setMessage('游戏结束！')
    } else {
      await supabase.from('game_rooms').update({ current_round: next, current_phase: 'draft' }).eq('id', roomId)
      setMessage(`已进入第${next}赛季选秀`)
    }
    setShowRanking(false); await fetchGameData()
  }

  const phaseLabel = (p: string) => { const m: any = { draft: '选秀阶段', match: '比赛阶段' }; return m[p] || p }
  const moveUp = (userId: string) => { const cur = rankings[userId]; if (cur <= 1) return; const n = { ...rankings }; const swap = Object.keys(n).find(k => n[k] === cur - 1); if (swap) { n[userId] = cur - 1; n[swap] = cur }; setRankings(n) }
  const moveDown = (userId: string) => { const cur = rankings[userId]; if (cur >= players.length) return; const n = { ...rankings }; const swap = Object.keys(n).find(k => n[k] === cur + 1); if (swap) { n[userId] = cur + 1; n[swap] = cur }; setRankings(n) }
  const sortedByRank = [...players].sort((a, b) => (rankings[a.user_id] || 99) - (rankings[b.user_id] || 99))

  if (!userProfile || !room) return <div className="min-h-screen bg-white flex items-center justify-center"><p className="text-gray-500">加载中...</p></div>

  if (room.status === 'finished') {
    return (
      <div className="min-h-screen bg-white">
        <div className="border-b border-gray-200 bg-red-50"><div className="max-w-4xl mx-auto px-8 py-4 flex justify-between items-center"><div><h1 className="text-lg font-bold text-red-700">{room.name || '游戏局'} <span className="text-sm font-normal text-gray-500">(GM视角)</span></h1><p className="text-sm text-gray-500">游戏已结束</p></div><button onClick={() => router.push('/dashboard')} className="px-4 py-1.5 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 text-sm">返回GM中心</button></div></div>
        <div className="max-w-4xl mx-auto px-8 py-6"><div className="bg-white border border-gray-200 rounded-lg p-6"><h2 className="text-xl font-semibold text-gray-900 mb-4">最终排名</h2><div className="space-y-2">{finalRanking.map((p: any, i: number) => (<div key={p.user_id} className="flex items-center gap-3 bg-gray-50 p-3 rounded"><span className="text-xl font-bold w-10">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span><span className="flex-1 text-gray-900 font-medium">{p.users?.username}</span><span className="text-sm text-gray-500">💰{p.money} ⭐{p.score}</span></div>))}</div></div></div>
      </div>
    )
  }

  const allDone = allPlayersFinalized()
  const currentRound = room?.current_round || 1
  const scoreLabel = currentRound <= 4 ? '10/8/6/4/2/0' : currentRound <= 6 ? '15/12/9/6/3/0' : '20/16/12/8/4/0'

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-gray-200 bg-red-50"><div className="max-w-4xl mx-auto px-8 py-4 flex justify-between items-center"><div><h1 className="text-lg font-bold text-red-700">{room.name || '游戏局'} <span className="text-sm font-normal text-gray-500">(GM视角)</span></h1><p className="text-sm text-gray-500">第 {room.current_round}/7 赛季 · {phaseLabel(room.current_phase)}</p></div><button onClick={() => router.push('/dashboard')} className="px-4 py-1.5 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 text-sm">退出</button></div></div>
      <div className="max-w-4xl mx-auto px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {message && <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{message}<button onClick={() => setMessage('')} className="ml-2 underline">关闭</button></div>}

          {/* 选秀阶段 */}
          {room.current_phase === 'draft' && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-center mb-3"><h2 className="text-lg font-semibold text-gray-900">选秀阶段</h2>{allDone && <button onClick={enterMatchPhase} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition-colors">进入比赛阶段</button>}</div>
              {draftedPlayers.length > 0 ? (
                <div className="space-y-3">
                  {(() => {
                    const g: any = {}; draftedPlayers.forEach((r: any) => { if (!g[r.user_id]) g[r.user_id] = []; g[r.user_id].push(r) })
                    return Object.entries(g).map(([uid, recs]: any) => {
                      const currentFinals = recs.filter((r: any) => r.round === room?.current_round && r.status === 'final')
                      return (<div key={uid} className="bg-gray-50 p-3 rounded"><div className="flex justify-between items-center mb-2"><span className="text-sm font-medium text-gray-900">{recs[0]?.users?.username}</span>{currentFinals.length > 0 ? <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">大名单 {currentFinals.filter((r: any) => r.player_id !== null).length}人</span> : <span className="text-xs text-gray-400">未确定大名单</span>}</div><div className="flex flex-wrap gap-1">{recs.filter((r: any) => r.player_id !== null).map((r: any) => { const isCurrentFinal = r.round === room?.current_round && r.status === 'final'; return (<span key={r.id} className={`text-xs px-2 py-1 rounded ${isCurrentFinal ? 'bg-red-100 text-red-700 font-medium' : 'bg-white border border-gray-200 text-gray-600'}`}>{r.players_pool?.name} ({r.players_pool?.cost}费){r.round !== room?.current_round && <span className="ml-1 text-gray-400">S{r.round}</span>}</span>) })}</div></div>)
                    })
                  })()}
                </div>
              ) : <p className="text-gray-500 text-center py-4">等待玩家选秀...</p>}
            </div>
          )}

          {/* 比赛阶段 */}
          {room.current_phase === 'match' && (
            <>
              <div className="bg-white border border-gray-200 rounded-lg p-6"><h2 className="text-xl font-semibold text-gray-900 mb-4">比赛阶段</h2><p className="text-gray-500 mb-4">提交比赛排名，发放奖金和分数（1-6名：8/7/7/6/6/5元，分数：{scoreLabel}分）</p><button onClick={openRanking} className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors">提交比赛成绩</button></div>
              {draftedPlayers.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h2 className="text-lg font-semibold text-gray-900 mb-3">队伍列表</h2>
                  <div className="space-y-3">
                    {(() => {
                      const g: any = {}; draftedPlayers.forEach((r: any) => { if (!g[r.user_id]) g[r.user_id] = []; g[r.user_id].push(r) })
                      return Object.entries(g).map(([uid, recs]: any) => (
                        <div key={uid} className="bg-gray-50 p-3 rounded"><div className="flex justify-between items-center mb-2"><span className="text-sm font-medium text-gray-900">{recs[0]?.users?.username}</span></div><div className="flex flex-wrap gap-1">{recs.filter((r: any) => r.player_id !== null).map((r: any) => (<span key={r.id} className={`text-xs px-2 py-1 rounded ${r.status === 'final' ? 'bg-red-100 text-red-700 font-medium' : 'bg-white border border-gray-200 text-gray-600'}`}>{r.players_pool?.name} ({r.players_pool?.cost}费){r.round !== room?.current_round && <span className="ml-1 text-gray-400">S{r.round}</span>}</span>))}</div></div>
                      ))
                    })()}
                  </div>
                </div>
              )}
            </>
          )}

          {showRanking && (
            <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto"><h3 className="text-lg font-semibold text-gray-900 mb-4">设置排名</h3><p className="text-xs text-gray-400 mb-3">排名奖励：第1名8元，第2-3名7元，第4-5名6元，第6名5元 | 分数：{scoreLabel}</p><div className="space-y-2 mb-4">{sortedByRank.map((p: any) => (<div key={p.user_id} className="flex items-center gap-3 bg-gray-50 p-2 rounded"><span className="text-lg font-bold text-red-600 w-8 text-center">#{rankings[p.user_id]}</span><span className="flex-1 text-sm text-gray-900">{p.users?.username}</span><span className="text-xs text-gray-500">💰{p.money} ⭐{p.score}</span><div className="flex flex-col gap-0.5"><button onClick={() => moveUp(p.user_id)} disabled={rankings[p.user_id] <= 1} className="text-xs px-1.5 py-0.5 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-30">▲</button><button onClick={() => moveDown(p.user_id)} disabled={rankings[p.user_id] >= players.length} className="text-xs px-1.5 py-0.5 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-30">▼</button></div></div>))}</div><div className="flex gap-2 justify-end"><button onClick={() => setShowRanking(false)} className="px-4 py-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50">取消</button><button onClick={submitRankings} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">确认提交</button></div></div></div>
          )}
        </div>
        <div className="space-y-4"><div className="bg-white border border-gray-200 rounded-lg p-4"><h2 className="text-lg font-semibold text-gray-900 mb-3">玩家信息 ({players.length}/6)</h2><div className="space-y-2">{players.map((p: any) => (<div key={p.user_id} className="flex justify-between items-center bg-gray-50 p-2 rounded"><span className="text-sm text-gray-900">{p.users?.username}</span><div className="text-xs text-gray-500">💰{p.money} ⭐{p.score}</div></div>))}</div></div></div>
      </div>
    </div>
  )
}