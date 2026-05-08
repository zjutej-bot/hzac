'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

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
  if (round <= 2) return { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1, 6: 0 }[rank] || 0
  if (round <= 4) return { 1: 10, 2: 8, 3: 6, 4: 4, 5: 2, 6: 0 }[rank] || 0
  if (round <= 6) return { 1: 15, 2: 12, 3: 9, 4: 6, 5: 3, 6: 0 }[rank] || 0
  return { 1: 20, 2: 16, 3: 12, 4: 8, 5: 4, 6: 0 }[rank] || 0
}

export default function PlayerGame() {
  const router = useRouter()
  const [userProfile, setUserProfile] = useState<any>(null)
  const [game, setGame] = useState<any>(null)
  const [myData, setMyData] = useState<any>(null)
  const [message, setMessage] = useState('')

  const [availablePlayers, setAvailablePlayers] = useState<any[]>([])
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set())
  const [myDraftedPlayers, setMyDraftedPlayers] = useState<any[]>([])
  const [finalSelected, setFinalSelected] = useState<Set<string>>(new Set())
  const [showReleaseConfirm, setShowReleaseConfirm] = useState<string | null>(null)
  const [showFinalConfirm, setShowFinalConfirm] = useState(false)

  const [showInterestPopup, setShowInterestPopup] = useState(false)
  const [interestAmount, setInterestAmount] = useState(0)
  const [interestCapped, setInterestCapped] = useState(false)

  const [showResultPopup, setShowResultPopup] = useState(false)
  const [resultData, setResultData] = useState<any>(null)

  // 所有玩家数据
  const [allPlayers, setAllPlayers] = useState<any[]>([])
  const [allPools, setAllPools] = useState<{ [uid: string]: any[] }>({})

  const roundDone = useRef(0)

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('currentUser') || '{}')
    if (!u.id) { router.push('/'); return }
    setUserProfile(u)
    if (u.role === 'gm') { router.push('/gm/game'); return }
    fetchGameData(u.id)
    const timer = setInterval(() => fetchGameData(u.id), 4000)
    return () => clearInterval(timer)
  }, [])

  const showLastSeasonResult = async (currentRound: number) => {
    const { data: games } = await supabase.from('games').select('match_result, player_ids').eq('status', 'playing').limit(1)
    const mr = games?.[0]?.match_result
    if (!mr || Object.keys(mr).length === 0) return
    const bonusM: any = { 1: 8, 2: 7, 3: 7, 4: 6, 5: 6, 6: 5 }
    const { data: users } = await supabase.from('users').select('*').in('id', games[0].player_ids || [])
    const ranks = mr as { [uid: string]: number }
    const results = (users || []).map((p: any) => ({
      username: p.username, rank: ranks[p.id] || 6,
      bonusMoney: bonusM[ranks[p.id]] || 5,
      bonusScore: getBonusScore(currentRound - 1, ranks[p.id] || 6),
    })).sort((a, b) => a.rank - b.rank)
    setResultData({ round: currentRound - 1, players: results })
    setShowResultPopup(true)
  }

  const doDraft = async (userId: string, round: number) => {
    await supabase.from('players_pool').update({ status: 'available', owner_id: null }).eq('owner_id', userId).eq('status', 'in_pool')
    const costs = SEASON_COST_RANGE[round] || [0,1,2,3,4,5,6,7]
    const { data: pool } = await supabase.from('players_pool').select('*').eq('status', 'available').is('owner_id', null).in('cost', costs)
    if (pool && pool.length > 0) {
      const pick = [...pool].sort(() => Math.random() - 0.5).slice(0, 5)
      for (const p of pick) await supabase.from('players_pool').update({ status: 'in_pool', owner_id: userId }).eq('id', p.id)
    }
    await supabase.from('users').update({ last_active_round: round }).eq('id', userId)
  }

  const fetchGameData = async (userId: string) => {
    const { data: u } = await supabase.from('users').select('*').eq('id', userId).single()
    if (!u?.in_game) { router.push('/players/dashboard'); return }
    setMyData(u)

    const { data: games } = await supabase.from('games').select('*').eq('status', 'playing').limit(1)
    const g = games?.[0] || null
    setGame(g)
    if (!g) return

    const cr = g.current_round
    if ((u.last_active_round || 0) < cr && roundDone.current !== cr) {
      roundDone.current = cr
      if (cr > 1) await showLastSeasonResult(cr)
      await doDraft(userId, cr)
    }

    // 加载所有玩家数据
    if (g.player_ids?.length > 0) {
      const { data: users } = await supabase.from('users').select('*').in('id', g.player_ids)
      setAllPlayers(users || [])
      const pools: { [uid: string]: any[] } = {}
      for (const p of users || []) {
        const { data: pool } = await supabase.from('players_pool').select('*').eq('owner_id', p.id).in('status', ['drafted','final']).order('sort_order')
        pools[p.id] = pool || []
      }
      setAllPools(pools)
    }

    const { data: drafted } = await supabase.from('players_pool').select('*').eq('owner_id', userId).in('status', ['drafted','final']).order('sort_order')
    setMyDraftedPlayers(drafted || [])

    if (g.current_phase === 'draft') {
      const { data: inPool } = await supabase.from('players_pool').select('*').eq('owner_id', userId).eq('status', 'in_pool').order('sort_order')
      setAvailablePlayers(inPool || [])
    } else {
      setAvailablePlayers([])
    }
  }

  const refreshPlayers = async () => {
    const u = JSON.parse(localStorage.getItem('currentUser') || '{}')
    const cr = game?.current_round || 1
    await supabase.from('players_pool').update({ status: 'available', owner_id: null }).eq('owner_id', u.id).eq('status', 'in_pool')
    const costs = SEASON_COST_RANGE[cr] || [0,1,2,3,4,5,6,7]
    const { data: pool } = await supabase.from('players_pool').select('*').eq('status', 'available').is('owner_id', null).in('cost', costs)
    if (pool && pool.length > 0) {
      const shuffled = [...pool].sort(() => Math.random() - 0.5)
      const selected = shuffled.slice(0, 5)
      for (const p of selected) await supabase.from('players_pool').update({ status: 'in_pool', owner_id: u.id }).eq('id', p.id)
      setAvailablePlayers(selected)
    } else {
      setAvailablePlayers([])
    }
    setSelectedPlayers(new Set())
    const { data: drafted } = await supabase.from('players_pool').select('*').eq('owner_id', u.id).in('status', ['drafted','final']).order('sort_order')
    setMyDraftedPlayers(drafted || [])
  }

  const manualRefresh = async () => {
    if ((myData?.money || 0) < 1) { setMessage('余额不足'); return }
    await supabase.from('users').update({ money: (myData.money || 0) - 1 }).eq('id', userProfile.id)
    await refreshPlayers()
  }

  const togglePlayer = (id: string) => setSelectedPlayers(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const totalCost = Array.from(selectedPlayers).reduce((s, id) => s + (availablePlayers.find(p => p.id === id)?.cost || 0), 0)

  const confirmDraft = async () => {
    if (selectedPlayers.size === 0) return
    if (totalCost > (myData?.money || 0)) { setMessage('余额不足'); return }
    const u = JSON.parse(localStorage.getItem('currentUser') || '{}')
    for (const pid of Array.from(selectedPlayers)) await supabase.from('players_pool').update({ status: 'drafted' }).eq('id', pid)
    await supabase.from('users').update({ money: (myData.money || 0) - totalCost }).eq('id', u.id)
    setAvailablePlayers(prev => prev.filter(p => !Array.from(selectedPlayers).includes(p.id)))
    setSelectedPlayers(new Set())
    const { data: drafted } = await supabase.from('players_pool').select('*').eq('owner_id', u.id).in('status', ['drafted','final']).order('sort_order')
    setMyDraftedPlayers(drafted || [])
  }

  const releasePlayer = async (id: string, cost: number) => {
    const refund = Math.max(1, cost - 1)
    await supabase.from('players_pool').update({ status: 'available', owner_id: null }).eq('id', id)
    await supabase.from('users').update({ money: (myData.money || 0) + refund }).eq('id', userProfile.id)
    setFinalSelected(p => { const n = new Set(p); n.delete(id); return n })
    setShowReleaseConfirm(null)
    const u = JSON.parse(localStorage.getItem('currentUser') || '{}')
    const { data: drafted } = await supabase.from('players_pool').select('*').eq('owner_id', u.id).in('status', ['drafted','final']).order('sort_order')
    setMyDraftedPlayers(drafted || [])
  }

  const toggleFinal = (id: string) => setFinalSelected(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else { if (n.size >= MAX_ROSTER_SIZE) { setMessage(`最多${MAX_ROSTER_SIZE}人`); return p } n.add(id) } return n })
  const toggleSelectAll = () => {
    const s = myDraftedPlayers.filter(r => r.status === 'drafted')
    if (!s.length) return
    const m = Math.min(s.length, MAX_ROSTER_SIZE)
    setFinalSelected(p => p.size === m ? new Set() : new Set(s.slice(0, MAX_ROSTER_SIZE).map(r => r.id)))
  }
  const confirmFinalRoster = () => setShowFinalConfirm(true)

  const executeFinalRoster = async () => {
    const u = JSON.parse(localStorage.getItem('currentUser') || '{}')
    await supabase.from('players_pool').update({ status: 'available', owner_id: null }).eq('owner_id', u.id).eq('status', 'in_pool')
    for (const r of myDraftedPlayers.filter(r => r.status === 'drafted')) {
      if (finalSelected.has(r.id)) await supabase.from('players_pool').update({ status: 'final' }).eq('id', r.id)
    }
    await supabase.from('users').update({ if_final: true }).eq('id', u.id)
    const rawInterest = Math.floor((myData?.money || 0) / 5)
    const interest = Math.min(rawInterest, 5)
    const capped = rawInterest > 5
    if (interest > 0) await supabase.from('users').update({ money: (myData.money || 0) + interest }).eq('id', u.id)
    setInterestAmount(interest)
    setInterestCapped(capped)
    setShowInterestPopup(true)
    setShowFinalConfirm(false)
    setAvailablePlayers([])
    setSelectedPlayers(new Set())
    const { data: drafted } = await supabase.from('players_pool').select('*').eq('owner_id', u.id).in('status', ['drafted','final']).order('sort_order')
    setMyDraftedPlayers(drafted || [])
  }

  if (!userProfile || !game || !myData) return <div className="min-h-screen bg-white flex items-center justify-center"><p className="text-gray-500">加载中...</p></div>

  const isFinal = myData?.if_final
  const phase = game.current_phase === 'draft' ? '选秀阶段' : '比赛阶段'

  return (
    <div className="min-h-screen bg-white">
      {showInterestPopup && (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full mx-4 text-center"><div className="text-4xl mb-4">💰</div><h3 className="text-lg font-semibold text-gray-900 mb-2">利息结算</h3>{interestAmount > 0 ? <p className="text-gray-600 mb-2">获得了 <span className="text-red-600 font-bold text-xl">{interestAmount}</span> 元利息</p> : <p className="text-gray-600 mb-2">余额不足5元，未获得利息</p>}{interestCapped && <p className="text-xs text-orange-500 mb-2">利息已达上限（最高5元），超出部分不计算</p>}<p className="text-xs text-gray-400 mb-4">（每剩余5元获得1元利息，每赛季上限5元）</p><button onClick={() => setShowInterestPopup(false)} className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">确定</button></div></div>)}
      {showResultPopup && resultData && (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full mx-4 max-h-[80vh] overflow-y-auto"><h3 className="text-lg font-semibold text-gray-900 mb-1 text-center">比赛结果</h3><p className="text-xs text-gray-400 text-center mb-4">S{resultData.round} 赛季</p><div className="space-y-2 mb-4">{resultData.players.map((p: any, i: number) => (<div key={i} className="flex items-center justify-between bg-gray-50 p-2 rounded"><div className="flex items-center gap-2"><span className="font-bold text-red-600 w-6">#{p.rank}</span><span className="text-sm text-gray-900">{p.username}</span></div><span className="text-xs text-gray-500">{p.bonusMoney}元 {p.bonusScore}分</span></div>))}</div><button onClick={() => setShowResultPopup(false)} className="w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">确定</button></div></div>)}
      <div className="border-b border-gray-200 bg-red-50"><div className="max-w-4xl mx-auto px-8 py-4 flex justify-between items-center"><div><h1 className="text-lg font-bold text-red-700">游戏局</h1><p className="text-sm text-gray-500">第 {game.current_round}/7 赛季 · {phase}</p></div><div className="flex items-center gap-4"><div className="text-right"><p className="text-sm text-gray-500">{userProfile.username}</p><p className="text-lg font-bold text-red-600">💰{myData.money}元 ⭐{myData.score}分</p></div><button onClick={() => router.push('/players/dashboard')} className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 text-sm">退出</button></div></div></div>
      <div className="max-w-4xl mx-auto px-8 py-6 grid grid-cols-3 gap-6">
        {/* 左侧：阵容 + 操作 */}
        <div className="col-span-2 space-y-4">
          {message && <div className="p-2 rounded text-sm bg-red-50 border border-red-200 text-red-700">{message}<button onClick={() => setMessage('')} className="ml-2 underline">关闭</button></div>}
          {showFinalConfirm && (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full mx-4"><h3 className="text-lg font-semibold text-gray-900 mb-2">确认大名单</h3><p className="text-gray-600 mb-1">确定提交大名单吗？（{finalSelected.size}人）</p><p className="text-gray-500 text-sm mb-4">确定后本季将无法再选秀</p><div className="flex gap-2 justify-end"><button onClick={() => setShowFinalConfirm(false)} className="px-4 py-2 border border-gray-300 rounded text-gray-600">取消</button><button onClick={executeFinalRoster} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">确认</button></div></div></div>)}

          {game.current_phase === 'match' && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">S{game.current_round} 排名奖励明细</p>
              <div className="grid grid-cols-7 gap-1 text-xs text-gray-600 mb-1"><span>排名</span><span className="text-center font-medium">#1</span><span className="text-center font-medium">#2</span><span className="text-center font-medium">#3</span><span className="text-center font-medium">#4</span><span className="text-center font-medium">#5</span><span className="text-center font-medium">#6</span></div>
              <div className="grid grid-cols-7 gap-1 text-xs text-gray-600 mb-1"><span>奖金</span><span className="text-center">8元</span><span className="text-center">7元</span><span className="text-center">7元</span><span className="text-center">6元</span><span className="text-center">6元</span><span className="text-center">5元</span></div>
              <div className="grid grid-cols-7 gap-1 text-xs text-gray-600"><span>分数</span>{[1,2,3,4,5,6].map(r=>(<span key={r} className="text-center">{getBonusScore(game.current_round, r)}分</span>))}</div>
            </div>
          )}

          {/* GM端同款全玩家阵容 */}
          <div className="space-y-3">
            {allPlayers.map((p: any) => {
              const pool = allPools[p.id] || []
              const sorted = [...pool].sort((a: any, b: any) => {
                if (a.status === 'final' && b.status !== 'final') return -1
                if (a.status !== 'final' && b.status === 'final') return 1
                return (a.sort_order || 0) - (b.sort_order || 0)
              })
              return (
                <div key={p.id} className={`bg-white border rounded-lg p-3 ${p.id === userProfile.id ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-gray-900">{p.username}</span>
                    {p.if_final ? <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">大名单 {pool.filter((r: any) => r.status === 'final').length}人</span> : <span className="text-xs text-gray-400">未确定</span>}
                  </div>
                  {pool.length === 0 ? <p className="text-xs text-gray-400">暂无球员</p> : (
                    <div className="flex flex-wrap gap-1">
                      {sorted.map((r: any) => (
                        <span key={r.id} className={`text-xs px-2 py-1 rounded ${r.status === 'final' ? 'bg-red-100 text-red-700 font-medium' : 'bg-gray-100 border border-gray-200 text-gray-600'}`}>{r.name} ({r.cost}费)</span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 自己的选秀操作 */}
          {game.current_phase === 'draft' && !isFinal && (
            <div className="space-y-4">
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3"><h2 className="text-lg font-semibold text-gray-900">队伍操作</h2>{myDraftedPlayers.filter(r => r.status === 'drafted').length > 0 && (<button onClick={toggleSelectAll} className="text-xs text-red-500 hover:text-red-700">{finalSelected.size === Math.min(myDraftedPlayers.filter(r => r.status === 'drafted').length, MAX_ROSTER_SIZE) ? '取消全选' : `全选(最多${MAX_ROSTER_SIZE})`}</button>)}</div>
                {myDraftedPlayers.filter(r => r.status === 'drafted').length > 0 ? (
                  <div className="space-y-2">
                    {myDraftedPlayers.filter(r => r.status === 'drafted').map(r => (
                      <div key={r.id} onClick={() => toggleFinal(r.id)} className={`flex items-center justify-between p-3 rounded border cursor-pointer ${finalSelected.has(r.id) ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}>
                        <div className="flex items-center gap-3"><input type="checkbox" checked={finalSelected.has(r.id)} onChange={() => {}} className="accent-red-600 w-4 h-4" /><span className="text-sm text-gray-900">{r.name}</span><span className="text-xs text-gray-500">({r.cost}费)</span></div>
                        <button onClick={e => { e.stopPropagation(); setShowReleaseConfirm(r.id) }} className="px-3 py-1 text-xs border border-red-300 text-red-500 rounded hover:bg-red-50">遣散</button>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-gray-400 text-sm py-2">暂无球员</p>}
                {showReleaseConfirm && (() => { const r = myDraftedPlayers.find(x => x.id === showReleaseConfirm); return (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full mx-4"><h3 className="text-lg font-semibold text-gray-900 mb-2">确认遣散</h3><p className="text-gray-600 mb-1">确定遣散 <span className="text-red-600 font-medium">{r?.name}</span> 吗？</p><p className="text-gray-500 text-sm mb-4">将返还 {Math.max(1, (r?.cost||0)-1)} 元</p><div className="flex gap-2 justify-end"><button onClick={() => setShowReleaseConfirm(null)} className="px-4 py-2 border border-gray-300 rounded">取消</button><button onClick={() => releasePlayer(r.id, r.cost||0)} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">确认</button></div></div></div>) })()}
                <button onClick={confirmFinalRoster} className="mt-3 w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium">选定大名单 ({finalSelected.size}人)</button>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">选秀</h2>
                <p className="text-gray-500 text-xs mb-3">S{game.current_round} 可选：{SEASON_COST_LABELS[game.current_round]}（{SEASON_COST_RANGE[game.current_round]?.join('、')}费）</p>
                <details className="text-xs text-gray-400 mb-3"><summary className="cursor-pointer hover:text-gray-500">查看所有赛季费用</summary><div className="mt-1 space-y-0.5 bg-gray-50 p-2 rounded">{[1,2,3,4,5,6,7].map(s => (<div key={s} className={s === game.current_round ? 'text-red-600 font-medium' : ''}>S{s}：{SEASON_COST_LABELS[s]}（{SEASON_COST_RANGE[s]?.join('、')}费）</div>))}</div></details>
                <div className="flex justify-end mb-3"><button onClick={manualRefresh} disabled={(myData?.money||0) < 1} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium">刷新 (1元)</button></div>
                {availablePlayers.length > 0 ? (
                  <div className="space-y-2 mb-4">
                    {availablePlayers.map(p => (
                      <div key={p.id} onClick={() => togglePlayer(p.id)} className={`flex items-center justify-between p-3 rounded border cursor-pointer ${selectedPlayers.has(p.id) ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}>
                        <div className="flex items-center gap-3"><input type="checkbox" checked={selectedPlayers.has(p.id)} onChange={() => {}} className="accent-red-600 w-4 h-4" /><span className="text-sm text-gray-900">{p.name}</span></div>
                        <span className="text-red-600 font-bold">{p.cost}元</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-gray-400 text-center py-4"></p>}
                {selectedPlayers.size > 0 && (<div className="border-t border-gray-200 pt-4"><div className="flex justify-between items-center mb-3"><span className="text-gray-600">已选 {selectedPlayers.size} 人</span><span className="text-lg font-bold text-red-600">合计: {totalCost}元</span></div><button onClick={confirmDraft} disabled={totalCost > (myData?.money||0)} className="w-full py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium">{totalCost > (myData?.money||0) ? '余额不足' : '购买'}</button></div>)}
              </div>
            </div>
          )}
        </div>

        {/* 右侧：金币分数表 */}
        <div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">玩家 ({allPlayers.length}/6)</h2>
            <div className="space-y-2">
              {allPlayers.map((p: any) => (
                <div key={p.id} className={`flex justify-between items-center p-2 rounded ${p.id === userProfile.id ? 'bg-red-50' : 'bg-gray-50'}`}>
                  <span className="text-sm text-gray-900">{p.username}</span>
                  <span className="text-xs text-gray-500">💰{p.money} ⭐{p.score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
