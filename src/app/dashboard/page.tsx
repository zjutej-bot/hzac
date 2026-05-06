'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Dashboard() {
  const [userProfile, setUserProfile] = useState<any>(null)
  const router = useRouter()

  const [showResetPwd, setShowResetPwd] = useState(false)
  const [newPwd, setNewPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')
  const [showDelete, setShowDelete] = useState(false)

  useEffect(() => {
    const userStr = localStorage.getItem('currentUser')
    if (!userStr) { router.push('/'); return }
    setUserProfile(JSON.parse(userStr))
  }, [])

  const logout = () => { localStorage.removeItem('currentUser'); router.push('/') }

  const resetPassword = async () => {
    if (!newPwd.trim()) { setPwdMsg('请输入新密码'); return }
    await supabase.from('users').update({ password: newPwd.trim() }).eq('id', userProfile.id)
    setPwdMsg('密码已更新，请重新登录')
    setTimeout(() => { setShowResetPwd(false); setNewPwd(''); setPwdMsg(''); logout() }, 1500)
  }

  const deleteAccount = async () => {
    await supabase.from('room_players').delete().eq('user_id', userProfile.id)
    await supabase.from('draft_records').delete().eq('user_id', userProfile.id)
    await supabase.from('users').delete().eq('id', userProfile.id)
    logout()
  }

  if (!userProfile) return <div className="min-h-screen bg-white flex items-center justify-center"><p className="text-gray-500">加载中...</p></div>

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-8 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-red-700">华足自走棋</h1>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-sm">{userProfile.username}</span>
            <button onClick={() => setShowResetPwd(true)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">重设密码</button>
            <button onClick={() => setShowDelete(true)} className="px-3 py-1.5 text-sm text-red-500 hover:text-red-700">注销</button>
            <button onClick={logout} className="px-4 py-1.5 border border-red-300 text-red-600 rounded hover:bg-red-50 text-sm transition-colors">登出</button>
          </div>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-8 py-6 space-y-8">
        <PlayerMyGames />
        <div className="border-t border-gray-200" />
        <PlayerWaitingRooms />
      </div>

      {showResetPwd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">重设密码</h3>
            <input type="text" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} className="w-full p-2.5 rounded border border-gray-300 text-gray-900 mb-3" placeholder="输入新密码" />
            {pwdMsg && <p className="text-sm text-green-600 mb-2">{pwdMsg}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowResetPwd(false); setNewPwd(''); setPwdMsg('') }} className="px-4 py-2 border border-gray-300 rounded text-gray-600">取消</button>
              <button onClick={resetPassword} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">确认</button>
            </div>
          </div>
        </div>
      )}
      {showDelete && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">确认注销</h3>
            <p className="text-gray-600 mb-4">注销后账号将永久删除，无法恢复。</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDelete(false)} className="px-4 py-2 border border-gray-300 rounded text-gray-600">取消</button>
              <button onClick={deleteAccount} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">确认注销</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PlayerMyGames() {
  const [myRooms, setMyRooms] = useState<any[]>([])
  const [roomPlayers, setRoomPlayers] = useState<{ [roomId: string]: any[] }>({})
  const [showResult, setShowResult] = useState<string | null>(null)
  const [resultData, setResultData] = useState<any[]>([])
  const router = useRouter()

  useEffect(() => { fetchMyGames() }, [])

  const fetchMyGames = async () => {
    const userStr = localStorage.getItem('currentUser')
    if (!userStr) return
    const user = JSON.parse(userStr)
    const { data: myRoomPlayers } = await supabase.from('room_players').select('room_id').eq('user_id', user.id)
    if (myRoomPlayers && myRoomPlayers.length > 0) {
      const roomIds = myRoomPlayers.map(rp => rp.room_id)
      const { data: rooms } = await supabase.from('game_rooms').select('*').in('id', roomIds).in('status', ['playing', 'finished']).order('created_at', { ascending: false })
      setMyRooms(rooms || [])
      if (rooms) { for (const room of rooms) { const { data: players } = await supabase.from('room_players').select(`*, users:user_id (username)`).eq('room_id', room.id); setRoomPlayers(prev => ({ ...prev, [room.id]: players || [] })) } }
    }
  }

  const openResult = (roomId: string) => {
    const players = roomPlayers[roomId] || []
    setResultData([...players].sort((a, b) => (b.score || 0) - (a.score || 0) || (b.money || 0) - (a.money || 0)))
    setShowResult(roomId)
  }

  if (myRooms.length === 0) return null

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">我的游戏</h2>
      <div className="space-y-3">
        {myRooms.map((room) => {
          const players = roomPlayers[room.id] || []
          const myPlayer = players.find((p: any) => p.user_id === JSON.parse(localStorage.getItem('currentUser') || '{}').id)
          return (
            <div key={room.id} className={`p-4 rounded-lg border ${room.status === 'playing' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <div><span className="text-gray-900 font-medium">{room.name || '未命名房间'}</span><span className={`ml-2 text-xs font-medium ${room.status === 'playing' ? 'text-red-600' : 'text-gray-400'}`}>{room.status === 'playing' ? '进行中' : '已结束'}</span><span className="ml-2 text-xs text-gray-400">{players.length}/6人</span></div>
                <div className="flex items-center gap-3">
                  {myPlayer && <div className="text-sm text-gray-600">💰{myPlayer.money} ⭐{myPlayer.score}</div>}
                  {room.status === 'playing' && <button onClick={() => router.push(`/game/${room.id}`)} className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors">进入游戏</button>}
                  {room.status === 'finished' && <button onClick={() => openResult(room.id)} className="px-5 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium transition-colors">查看排名</button>}
                </div>
              </div>
              {players.length > 0 && (<div className="mt-3 pt-3 border-t border-gray-200"><div className="flex flex-wrap gap-2">{players.map((player: any) => (<div key={player.user_id} className={`px-2 py-1 rounded text-sm ${player.user_id === JSON.parse(localStorage.getItem('currentUser') || '{}').id ? 'bg-red-200 text-red-700 font-medium' : 'bg-white text-gray-600'}`}>{player.users?.username} <span className="text-xs">💰{player.money} ⭐{player.score}</span></div>))}</div></div>)}
            </div>
          )
        })}
      </div>
      {showResult && (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto"><h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">最终排名</h3><div className="space-y-2 mb-4">{resultData.map((p: any, i: number) => (<div key={p.user_id} className="flex items-center gap-3 bg-gray-50 p-2 rounded"><span className="text-xl font-bold w-10">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span><span className="flex-1 text-sm text-gray-900">{p.users?.username}</span><span className="text-xs text-gray-500">💰{p.money} ⭐{p.score}</span></div>))}</div><button onClick={() => setShowResult(null)} className="w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">关闭</button></div></div>)}
    </div>
  )
}

function PlayerWaitingRooms() {
  const [rooms, setRooms] = useState<any[]>([])
  const [roomPlayerCounts, setRoomPlayerCounts] = useState<{ [roomId: string]: number }>({})
  const [roomPlayers, setRoomPlayers] = useState<{ [roomId: string]: any[] }>({})
  const [message, setMessage] = useState('')
  const [myJoinedRooms, setMyJoinedRooms] = useState<Set<string>>(new Set())
  const router = useRouter()

  useEffect(() => { fetchRooms() }, [])

  const fetchRooms = async () => {
    const userStr = localStorage.getItem('currentUser')
    if (!userStr) return
    const user = JSON.parse(userStr)
    const { data } = await supabase.from('game_rooms').select('*').eq('status', 'waiting').order('created_at', { ascending: false })
    setRooms(data || [])
    if (data) {
      const joinedSet = new Set<string>()
      for (const room of data) {
        const { count } = await supabase.from('room_players').select('*', { count: 'exact', head: true }).eq('room_id', room.id)
        setRoomPlayerCounts(prev => ({ ...prev, [room.id]: count || 0 }))
        const { data: players } = await supabase.from('room_players').select(`*, users:user_id (username)`).eq('room_id', room.id)
        setRoomPlayers(prev => ({ ...prev, [room.id]: players || [] }))
        if (players?.some((p: any) => p.user_id === user.id)) joinedSet.add(room.id)
      }
      setMyJoinedRooms(joinedSet)
    }
  }

  const joinRoom = async (roomId: string) => {
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}')
    const { data: existing } = await supabase.from('room_players').select('*').eq('room_id', roomId).eq('user_id', user.id).single()
    if (!existing) { await supabase.from('room_players').insert({ room_id: roomId, user_id: user.id, money: 0, score: 0 }); setMessage('已加入房间') }
    else setMessage('你已在该房间中')
    fetchRooms()
  }

  const leaveRoom = async (roomId: string) => {
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}')
    await supabase.from('room_players').delete().eq('room_id', roomId).eq('user_id', user.id)
    setMessage('已退出房间'); fetchRooms()
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">等待中的房间</h2>
      {message && <div className={`mb-3 p-2 rounded text-sm ${message.includes('已加入') || message.includes('已退出') ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>{message}<button onClick={() => setMessage('')} className="ml-2 underline">关闭</button></div>}
      {rooms.length === 0 ? <p className="text-gray-400 text-sm">暂无可用房间</p> : (
        <div className="space-y-3">
          {rooms.map((room) => {
            const count = roomPlayerCounts[room.id] || 0; const isFull = count >= 6; const players = roomPlayers[room.id] || []; const hasJoined = myJoinedRooms.has(room.id)
            return (
              <div key={room.id} className={`border rounded-lg ${hasJoined ? 'bg-gray-50 border-gray-300' : 'bg-white border-gray-200'}`}>
                <div className="p-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2"><span className="text-gray-900 font-medium">{room.name || '未命名房间'}</span><span className={`text-xs px-1.5 py-0.5 rounded ${isFull ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>{count}/6人</span>{hasJoined && <span className="text-xs text-gray-500">已加入</span>}</div>
                    {hasJoined ? <button onClick={() => leaveRoom(room.id)} className="px-5 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium transition-colors text-sm">退出</button> : <button onClick={() => joinRoom(room.id)} disabled={isFull} className="px-5 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors text-sm">{isFull ? '已满' : '加入'}</button>}
                  </div>
                  {players.length > 0 && (<div className="mt-3 pt-3 border-t border-gray-200"><div className="flex flex-wrap gap-2">{players.map((p: any) => (<div key={p.user_id} className={`px-2 py-1 rounded text-sm ${p.user_id === JSON.parse(localStorage.getItem('currentUser') || '{}').id ? 'bg-gray-200 text-gray-700 font-medium' : 'bg-gray-50 border border-gray-200 text-gray-600'}`}>{p.users?.username}</div>))}</div></div>)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}