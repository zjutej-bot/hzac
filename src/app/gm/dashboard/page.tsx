'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function GMDashboard() {
  const [userProfile, setUserProfile] = useState<any>(null)
  const router = useRouter()

  const [showResetPwd, setShowResetPwd] = useState(false)
  const [newPwd, setNewPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')
  const [showDelete, setShowDelete] = useState(false)

  const [game, setGame] = useState<any>(null)
  const [gamePlayers, setGamePlayers] = useState<any[]>([])
  const [showScoreboard, setShowScoreboard] = useState<any>(null)
  const [historyGames, setHistoryGames] = useState<any[]>([])

  useEffect(() => {
    const userStr = localStorage.getItem('currentUser')
    if (!userStr) { router.push('/'); return }
    const user = JSON.parse(userStr)
    if (user.role !== 'gm') { router.push('/players/dashboard'); return }
    setUserProfile(user)
    fetchData()
  }, [])

  const fetchData = async () => {
    const { data: currentGames } = await supabase.from('games').select('*').in('status', ['waiting', 'playing']).limit(1)
    const g = currentGames?.[0] || null
    setGame(g)
    if (g?.player_ids?.length > 0) {
      const { data: players } = await supabase.from('users').select('*').in('id', g.player_ids)
      setGamePlayers(players || [])
    } else { setGamePlayers([]) }

    const { data: finished } = await supabase.from('games').select('*').eq('status', 'finished_normal').order('id', { ascending: false })
    setHistoryGames(finished || [])
  }

  const logout = () => { localStorage.removeItem('currentUser'); router.push('/') }

  const resetPassword = async () => {
    if (!newPwd.trim()) { setPwdMsg('请输入新密码'); return }
    await supabase.from('users').update({ password: newPwd.trim() }).eq('id', userProfile.id)
    setPwdMsg('密码已更新，请重新登录')
    setTimeout(() => { setShowResetPwd(false); setNewPwd(''); setPwdMsg(''); logout() }, 1500)
  }

  const deleteAccount = async () => {
    await supabase.from('players_pool').update({ owner_id: null, status: 'available' }).eq('owner_id', userProfile.id)
    await supabase.from('users').delete().eq('id', userProfile.id)
    logout()
  }

  const startGame = async () => {
    if (!game || (game.participants || 0) < 1) return
    for (const p of gamePlayers) await supabase.from('users').update({ money: 8 }).eq('id', p.id)  // 改为 8 元
    await supabase.from('games').update({ status: 'playing', current_round: 1, current_phase: 'draft' }).eq('id', game.id)
    fetchData()
  }

  const resetRoom = async () => {
    if (!confirm('确定重置房间吗？所有玩家将退出。')) return
    await supabase.from('players_pool').update({ owner_id: null, status: 'available' })
    await supabase.from('users').update({ in_game: false, money: 0, score: 0 }).in('id', game?.player_ids || [])
    await supabase.from('games').update({ participants: 0, player_ids: [], match_result: '{}', scoreboard: null }).eq('id', game.id).eq('status', 'waiting')
    const { data: waiting } = await supabase.from('games').select('*').eq('status', 'waiting').limit(1)
    if (!waiting || waiting.length === 0) {
      const { data: maxNum } = await supabase.from('games').select('game_number').order('game_number', { ascending: false }).limit(1)
      const nextNum = (maxNum?.[0]?.game_number || 0) + 1
      await supabase.from('games').insert({ status: 'waiting', current_round: 1, current_phase: 'draft', participants: 0, player_ids: [], match_result: '{}', game_number: nextNum })
    }
    fetchData()
  }

  const kickPlayer = async (userId: string) => {
    await supabase.from('players_pool').update({ owner_id: null, status: 'available' }).eq('owner_id', userId)
    await supabase.from('users').update({ in_game: false, money: 0, score: 0 }).eq('id', userId)
    const newIds = (game.player_ids || []).filter((id: string) => id !== userId)
    await supabase.from('games').update({ participants: newIds.length, player_ids: newIds }).eq('id', game.id)
    fetchData()
  }

  if (!userProfile) return <div className="min-h-screen bg-white flex items-center justify-center"><p className="text-gray-500">加载中...</p></div>

  const isWaiting = game?.status === 'waiting'
  const isPlaying = game?.status === 'playing'
  const isFinished = game?.status === 'finished_normal' || game?.status === 'finished_manual'

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-8 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-red-700">GM中心</h1>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-sm">{userProfile.username}</span>
            <button onClick={() => setShowResetPwd(true)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">重设密码</button>
            <button onClick={() => setShowDelete(true)} className="px-3 py-1.5 text-sm text-red-500 hover:text-red-700">注销</button>
            <button onClick={logout} className="px-4 py-1.5 border border-red-300 text-red-600 rounded hover:bg-red-50 text-sm transition-colors">登出</button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-8 py-6 space-y-8">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">快捷入口</h2>
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => router.push('/gm/pool')} className="p-4 bg-white rounded-lg border border-gray-200 hover:border-red-300 text-left transition-all"><div className="text-base font-semibold text-gray-900">球员管理</div><div className="text-gray-500 text-sm">批量添加、删除球员</div></button>
            <button onClick={() => router.push('/gm/accounts')} className="p-4 bg-white rounded-lg border border-gray-200 hover:border-red-300 text-left transition-all"><div className="text-base font-semibold text-gray-900">账号管理</div><div className="text-gray-500 text-sm">查看、管理所有账号</div></button>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">当前游戏</h2>
          {game ? (
            <div className={`p-4 rounded-lg border ${isWaiting ? 'bg-gray-50 border-gray-200' : isPlaying ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-gray-900 font-semibold">游戏局{game.game_number}</span>
                  <span className={`text-sm font-medium ${isWaiting ? 'text-gray-500' : 'text-red-600'}`}>
                    {isWaiting ? '等待中' : isPlaying ? `进行中 · S${game.current_round}` : '已结束'}
                  </span>
                  <span className="text-sm text-gray-400">{game.participants || 0}/6人</span>
                </div>
                <div className="flex items-center gap-2">
                  {isPlaying && <button onClick={() => router.push('/gm/game')} className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors">进入游戏</button>}
                  {isWaiting && <button onClick={startGame} className="px-5 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium transition-colors text-sm">开始游戏</button>}
                  {isFinished && <button onClick={() => setShowScoreboard(game.scoreboard)} className="px-5 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium transition-colors text-sm">查看排名</button>}
                  {!isPlaying && <button onClick={resetRoom} className="px-5 py-2 border border-gray-300 text-gray-500 rounded-lg hover:bg-gray-100 text-sm transition-colors">重置房间</button>}
                </div>
              </div>

              {gamePlayers.length > 0 && (
                <div className="pt-3 border-t border-gray-200">
                  <div className="flex flex-wrap gap-2">
                    {gamePlayers.map((p: any) => (
                      <div key={p.id} className={`flex items-center gap-1 rounded px-2 py-1 text-sm ${isPlaying ? 'bg-red-100 text-red-700 font-medium' : 'bg-white border border-gray-200 text-gray-700'}`}>
                        {p.username}
                        {isWaiting && <button onClick={() => kickPlayer(p.id)} className="text-gray-400 hover:text-red-500 ml-1">✕</button>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-lg border bg-gray-50 border-gray-200 text-center text-gray-400 text-sm">暂无游戏局，请重置房间</div>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">历史游戏</h2>
          {historyGames.length === 0 ? (
            <div className="p-4 rounded-lg border bg-gray-50 border-gray-200 text-center text-gray-400 text-sm">暂无历史游戏记录</div>
          ) : (
            <div className="space-y-3">
              {historyGames.map((hg: any) => (
                <div key={hg.id} className="p-4 rounded-lg border bg-gray-50 border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-900 font-medium">游戏局{hg.game_number}</span>
                    <span className="text-xs text-gray-400">{hg.participants || 0}人参与</span>
                  </div>
                  <button onClick={() => setShowScoreboard(hg.scoreboard)} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-medium transition-colors">查看排名</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showScoreboard && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto"><h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">最终排名</h3><div className="space-y-2 mb-4">{(showScoreboard as any[]).map((p: any, i: number) => (<div key={i} className="flex items-center gap-3 bg-gray-50 p-2 rounded"><span className="text-xl font-bold w-10">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span><span className="flex-1 text-sm text-gray-900">{p.username}</span><span className="text-xs text-gray-500">💰{p.money} ⭐{p.score}</span></div>))}</div><button onClick={() => setShowScoreboard(null)} className="w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">关闭</button></div></div>
      )}

      {showResetPwd && (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full mx-4"><h3 className="text-lg font-semibold text-gray-900 mb-4">重设密码</h3><input type="text" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} className="w-full p-2.5 rounded border border-gray-300 text-gray-900 mb-3" placeholder="输入新密码" />{pwdMsg && <p className="text-sm text-green-600 mb-2">{pwdMsg}</p>}<div className="flex gap-2 justify-end"><button onClick={() => { setShowResetPwd(false); setNewPwd(''); setPwdMsg('') }} className="px-4 py-2 border border-gray-300 rounded text-gray-600">取消</button><button onClick={resetPassword} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">确认</button></div></div></div>)}
      {showDelete && (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full mx-4"><h3 className="text-lg font-semibold text-gray-900 mb-2">确认注销</h3><p className="text-gray-600 mb-4">注销后账号将永久删除，无法恢复。</p><div className="flex gap-2 justify-end"><button onClick={() => setShowDelete(false)} className="px-4 py-2 border border-gray-300 rounded text-gray-600">取消</button><button onClick={deleteAccount} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">确认注销</button></div></div></div>)}
    </div>
  )
}
