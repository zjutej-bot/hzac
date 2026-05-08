'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

function getBonusScore(round: number, rank: number): number {
  if (round <= 2) return { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1, 6: 0 }[rank] || 0
  if (round <= 4) return { 1: 10, 2: 8, 3: 6, 4: 4, 5: 2, 6: 0 }[rank] || 0
  if (round <= 6) return { 1: 15, 2: 12, 3: 9, 4: 6, 5: 3, 6: 0 }[rank] || 0
  return { 1: 20, 2: 16, 3: 12, 4: 8, 5: 4, 6: 0 }[rank] || 0
}

export default function GMGame() {
  const router = useRouter()
  const [userProfile, setUserProfile] = useState<any>(null)
  const [game, setGame] = useState<any>(null)
  const [players, setPlayers] = useState<any[]>([])
  const [pools, setPools] = useState<{ [uid: string]: any[] }>({})
  const [showRank, setShowRank] = useState(false)
  const [ranks, setRanks] = useState<{ [uid: string]: number }>({})
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const u = JSON.parse(localStorage.getItem('currentUser') || '{}')
    if (!u.id || u.role !== 'gm') { router.push('/players/dashboard'); return }
    setUserProfile(u)
    fetchGame()
    const t = setInterval(() => { if (mounted.current) fetchGame() }, 3000)
    return () => { mounted.current = false; clearInterval(t) }
  }, [])

  const fetchGame = async () => {
    const { data: games } = await supabase.from('games').select('*').eq('status', 'playing').limit(1)
    const g = games?.[0] || null
    setGame(g)
    if (!g?.player_ids?.length) { setPlayers([]); setPools({}); return }
    const { data: all } = await supabase.from('users').select('*').in('id', g.player_ids).order('id')
    setPlayers(all || [])
    const map: { [uid: string]: any[] } = {}
    for (const p of all || []) {
      const { data: pool } = await supabase.from('players_pool').select('*').eq('owner_id', p.id).in('status', ['drafted','final']).order('sort_order')
      map[p.id] = pool || []
    }
    setPools(map)
  }

  const allDone = () => players.length > 0 && players.every(p => p.if_final)

  const enterMatch = async () => {
    await supabase.from('games').update({ current_phase: 'match' }).eq('id', game.id)
    fetchGame()
  }

  const endGame = async () => {
    if (!confirm('终止游戏？')) return
    const currentNumber = game.game_number
    await supabase.from('games').update({ status: 'finished_manual' }).eq('id', game.id)
    await supabase.from('players_pool').update({ owner_id: null, status: 'available' }).neq('status', 'available')
    await supabase.from('users').update({ in_game: false, money: 0, score: 0, last_active_round: 0, if_final: false }).in('id', game.player_ids || [])
    await supabase.from('games').insert({ status: 'waiting', current_round: 1, current_phase: 'draft', participants: 0, player_ids: [], match_result: '{}', game_number: currentNumber })
    router.push('/gm/dashboard')
  }

  const openRank = () => {
    const init: { [uid: string]: number } = {}
    players.forEach((p, i) => { init[p.id] = i + 1 })
    setRanks(init)
    setShowRank(true)
  }

  const submit = async () => {
    const moneyMap: any = { 1: 8, 2: 7, 3: 7, 4: 6, 5: 6, 6: 5 }
    const cr = game.current_round
    for (const [uid, rank] of Object.entries(ranks)) {
      const bm = moneyMap[rank] || 5
      const bs = getBonusScore(cr, rank)
      const { data: u } = await supabase.from('users').select('money, score').eq('id', uid).single()
      if (u) await supabase.from('users').update({ money: (u.money||0) + bm, score: (u.score||0) + bs }).eq('id', uid)
    }
    await supabase.from('games').update({ match_result: ranks }).eq('id', game.id)
    await supabase.from('players_pool').update({ status: 'drafted' }).eq('status', 'final')
    await supabase.from('users').update({ if_final: false }).in('id', game.player_ids || [])

    const next = cr + 1
    if (next > 7) {
      const { data: all } = await supabase.from('users').select('*').in('id', game.player_ids)
      const sb = (all||[]).map(p => ({ id: p.id, username: p.username, money: p.money, score: p.score })).sort((a,b) => (b.score||0)-(a.score||0) || (b.money||0)-(a.money||0)).map((p,i) => ({...p, rank: i+1}))
      await supabase.from('games').update({ status: 'finished_normal', scoreboard: sb }).eq('id', game.id)
      await supabase.from('players_pool').update({ owner_id: null, status: 'available' }).neq('status', 'available')
      await supabase.from('users').update({ in_game: false, money: 0, score: 0, last_active_round: 0, if_final: false }).in('id', game.player_ids || [])
      const { data: maxNum } = await supabase.from('games').select('game_number').order('game_number', { ascending: false }).limit(1)
      const nextNum = (maxNum?.[0]?.game_number || 0) + 1
      await supabase.from('games').insert({ status: 'waiting', current_round: 1, current_phase: 'draft', participants: 0, player_ids: [], match_result: '{}', game_number: nextNum })
      router.push('/gm/dashboard')
      return
    }
    await supabase.from('games').update({ current_round: next, current_phase: 'draft' }).eq('id', game.id)
    setShowRank(false)
    fetchGame()
  }

  if (!userProfile || !game) return <div className="min-h-screen bg-white flex items-center justify-center"><p className="text-gray-500">加载中...</p></div>

  const cr = game.current_round
  const phase = game.current_phase === 'draft' ? '选秀阶段' : '比赛阶段'

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-gray-200 bg-red-50"><div className="max-w-4xl mx-auto px-8 py-4 flex justify-between items-center"><div><h1 className="text-lg font-bold text-red-700">游戏局{game.game_number} (GM)</h1><p className="text-sm text-gray-500">第 {cr}/7 赛季 · {phase}</p></div><div className="flex items-center gap-2"><button onClick={endGame} className="px-4 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm">终止游戏</button><button onClick={() => router.push('/gm/dashboard')} className="px-4 py-1.5 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 text-sm">退出</button></div></div></div>
      <div className="max-w-4xl mx-auto px-8 py-6">
        <div className="grid grid-cols-3 gap-6">
          {/* 左侧列 */}
          <div className="col-span-2 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">{phase}</h2>
            {game.current_phase === 'match' && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">S{cr} 排名奖励明细</p>
                <div className="grid grid-cols-7 gap-1 text-xs text-gray-600 mb-1"><span>排名</span><span className="text-center font-medium">#1</span><span className="text-center font-medium">#2</span><span className="text-center font-medium">#3</span><span className="text-center font-medium">#4</span><span className="text-center font-medium">#5</span><span className="text-center font-medium">#6</span></div>
                <div className="grid grid-cols-7 gap-1 text-xs text-gray-600 mb-1"><span>奖金</span><span className="text-center">8元</span><span className="text-center">7元</span><span className="text-center">7元</span><span className="text-center">6元</span><span className="text-center">6元</span><span className="text-center">5元</span></div>
                <div className="grid grid-cols-7 gap-1 text-xs text-gray-600"><span>分数</span>{[1,2,3,4,5,6].map(r=>(<span key={r} className="text-center">{getBonusScore(cr, r)}分</span>))}</div>
              </div>
            )}
            <div className="space-y-3">
              {players.map(p => {
                const pool = pools[p.id] || []
                const isFinal = p.if_final
                const show = isFinal ? [...pool].sort((a,b) => (a.status==='final'&&b.status!=='final'?-1:a.status!=='final'&&b.status==='final'?1:(a.sort_order||0)-(b.sort_order||0))) : pool.filter(r=>r.status==='drafted')
                return (<div key={p.id} className="bg-white border border-gray-200 rounded-lg p-3"><div className="flex justify-between items-center mb-1"><span className="text-sm font-medium text-gray-900">{p.username}</span>{isFinal ? <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">大名单 {pool.filter(r=>r.status==='final').length}人</span> : <span className="text-xs text-gray-400">未确定</span>}</div>{pool.length===0 ? <p className="text-xs text-gray-400">暂无球员</p> : <div className="flex flex-wrap gap-1">{show.map(r=>(<span key={r.id} className={`text-xs px-2 py-1 rounded ${r.status==='final'?'bg-red-100 text-red-700 font-medium':'bg-gray-100 border border-gray-200 text-gray-600'}`}>{r.name} ({r.cost}费)</span>))}</div>}</div>)
              })}
            </div>
          </div>
          {/* 右侧列 */}
          <div className="space-y-4">
            {game.current_phase === 'draft' && allDone() && (
              <button onClick={enterMatch} className="w-full py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">进入比赛阶段</button>
            )}
            {game.current_phase === 'match' && (
              <button onClick={openRank} className="w-full py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">提交比赛成绩</button>
            )}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">玩家 ({players.length}/6)</h2>
              <div className="space-y-2">{players.map(p=>(<div key={p.id} className="flex justify-between items-center bg-gray-50 p-2 rounded"><span className="text-sm text-gray-900">{p.username}</span><span className="text-xs text-gray-500">💰{p.money} ⭐{p.score}</span></div>))}</div>
            </div>
          </div>
        </div>
      </div>
      {showRank && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4"><h3 className="text-lg font-semibold text-gray-900 mb-4">设置排名</h3><div className="space-y-2 mb-4">{[...players].sort((a,b)=>(ranks[a.id]||99)-(ranks[b.id]||99)).map(p => { const rank = ranks[p.id]; const bm: any = {1:8,2:7,3:7,4:6,5:6,6:5}; return (<div key={p.id} className="flex items-center gap-3 bg-gray-50 p-2 rounded"><span className="text-lg font-bold text-red-600 w-8 text-center">#{rank}</span><span className="flex-1 text-sm text-gray-900">{p.username}</span><span className="text-xs text-gray-500">+{bm[rank]||5}元 +{getBonusScore(cr, rank)}分</span><div className="flex flex-col gap-0.5"><button onClick={() => { const c=ranks[p.id]; if(c<=1)return; const n={...ranks}; const s=Object.keys(n).find(k=>n[k]===c-1); if(s){n[p.id]=c-1;n[s]=c}; setRanks(n) }} disabled={ranks[p.id]<=1} className="text-xs px-1.5 py-0.5 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-30">▲</button><button onClick={() => { const c=ranks[p.id]; if(c>=players.length)return; const n={...ranks}; const s=Object.keys(n).find(k=>n[k]===c+1); if(s){n[p.id]=c+1;n[s]=c}; setRanks(n) }} disabled={ranks[p.id]>=players.length} className="text-xs px-1.5 py-0.5 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-30">▼</button></div></div>)})}</div><div className="flex gap-2 justify-end"><button onClick={() => setShowRank(false)} className="px-4 py-2 border border-gray-300 rounded text-gray-600">取消</button><button onClick={submit} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">确认提交</button></div></div></div>
      )}
    </div>
  )
}
