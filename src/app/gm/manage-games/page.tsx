'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function ManageGames() {
  const router = useRouter()
  const [userProfile, setUserProfile] = useState<any>(null)
  const [rooms, setRooms] = useState<any[]>([])
  const [roomPlayers, setRoomPlayers] = useState<{ [roomId: string]: any[] }>({})
  const [message, setMessage] = useState('')

  const [deleteRoomId, setDeleteRoomId] = useState<string | null>(null)
  const [kickTarget, setKickTarget] = useState<{ roomId: string; userId: string; username: string } | null>(null)
  const [startGameId, setStartGameId] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [roomName, setRoomName] = useState('')

  const [showResult, setShowResult] = useState<string | null>(null)
  const [resultData, setResultData] = useState<any[]>([])

  useEffect(() => {
    const userStr = localStorage.getItem('currentUser')
    if (!userStr) { router.push('/'); return }
    const user = JSON.parse(userStr)
    if (user.role !== 'gm') { router.push('/dashboard'); return }
    setUserProfile(user)
    fetchRooms()
  }, [])

  const fetchRooms = async () => {
    const { data } = await supabase.from('game_rooms').select('*').order('created_at', { ascending: false })
    setRooms(data || [])
    if (data) {
      for (const room of data) {
        const { data: players } = await supabase.from('room_players').select(`*, users:user_id (username)`).eq('room_id', room.id)
        setRoomPlayers(prev => ({ ...prev, [room.id]: players || [] }))
      }
    }
  }

  const createRoom = async () => {
    if (!roomName.trim()) { setMessage('请输入游戏局名称'); return }
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}')
    const { error } = await supabase.from('game_rooms').insert({ gm_id: user.id, name: roomName.trim(), max_players: 6, password: null })
    if (error) { setMessage('创建失败: ' + error.message) }
    else { setMessage(`游戏局"${roomName}"创建成功！`); setShowCreate(false); setRoomName(''); fetchRooms() }
  }

  const startGame = async (roomId: string) => {
    const players = roomPlayers[roomId] || []
    if (players.length < 1) { setMessage('至少需要1名玩家'); setStartGameId(null); return }
    for (const player of players) await supabase.from('room_players').update({ money: 5 }).eq('id', player.id)
    const { error } = await supabase.from('game_rooms').update({ status: 'playing', current_round: 1, current_phase: 'draft' }).eq('id', roomId)
    if (error) { setMessage('开始失败: ' + error.message) }
    else { setMessage('游戏已开始！每位玩家获得5元初始资金'); fetchRooms() }
    setStartGameId(null)
  }

  const deleteRoom = async (roomId: string) => {
    await supabase.from('round_rankings').delete().eq('room_id', roomId)
    await supabase.from('draft_records').delete().eq('room_id', roomId)
    await supabase.from('room_players').delete().eq('room_id', roomId)
    await supabase.from('game_rooms').delete().eq('id', roomId)
    setMessage('游戏局已删除'); setDeleteRoomId(null); fetchRooms()
  }

  const kickPlayer = async () => {
    if (!kickTarget) return
    await supabase.from('room_players').delete().eq('room_id', kickTarget.roomId).eq('user_id', kickTarget.userId)
    setMessage(`已踢出玩家"${kickTarget.username}"`); setKickTarget(null); fetchRooms()
  }

  const openResult = (roomId: string) => {
    const players = roomPlayers[roomId] || []
    setResultData([...players].sort((a, b) => (b.score || 0) - (a.score || 0) || (b.money || 0) - (a.money || 0)))
    setShowResult(roomId)
  }

  const statusLabel = (status: string) => {
    switch (status) { case 'waiting': return { text: '等待中', color: 'text-gray-500' }; case 'playing': return { text: '进行中', color: 'text-red-600' }; case 'finished': return { text: '已结束', color: 'text-gray-400' }; default: return { text: status, color: 'text-gray-600' } }
  }

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8"><h1 className="text-2xl font-bold text-red-700">游戏局管理</h1><div className="flex gap-2"><button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors">{showCreate ? '取消创建' : '+ 新建游戏局'}</button><button onClick={() => router.push('/gm/dashboard')} className="px-4 py-2 border border-red-300 text-red-600 rounded hover:bg-red-50 transition-colors">返回GM中心</button></div></div>
        {message && <div className={`mb-4 p-3 rounded border ${message.includes('成功') || message.includes('已') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{message}<button onClick={() => setMessage('')} className="ml-2 text-sm underline">关闭</button></div>}
        {showCreate && (
          <div className="mb-6 bg-white p-6 rounded-lg border border-gray-200 shadow-sm"><h2 className="text-lg font-semibold text-gray-900 mb-4">新建游戏局</h2><div className="space-y-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">游戏局名称 <span className="text-red-500">*</span></label><input type="text" value={roomName} onChange={(e) => setRoomName(e.target.value)} className="w-full p-2.5 rounded border border-gray-300 text-gray-900 focus:border-gray-500 focus:ring-1 focus:ring-gray-500 outline-none" placeholder="例如：第一局" /></div><p className="text-sm text-gray-400">人数上限：6人</p><button onClick={createRoom} className="w-full py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors">创建游戏局</button></div></div>
        )}
        {kickTarget && (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full mx-4"><h3 className="text-lg font-semibold text-gray-900 mb-2">确认踢出</h3><p className="text-gray-600 mb-4">确定要将玩家 <span className="text-red-600 font-medium">"{kickTarget.username}"</span> 踢出游戏局吗？</p><div className="flex gap-2 justify-end"><button onClick={() => setKickTarget(null)} className="px-4 py-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50">取消</button><button onClick={kickPlayer} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">确认踢出</button></div></div></div>)}
        {startGameId && (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full mx-4"><h3 className="text-lg font-semibold text-gray-900 mb-2">确认开始游戏</h3><p className="text-gray-600 mb-1">当前玩家：<span className="text-red-600 font-medium">{(roomPlayers[startGameId] || []).length}</span> 名</p><p className="text-gray-500 text-sm mb-4">每位玩家初始获得5元</p><div className="flex gap-2 justify-end"><button onClick={() => setStartGameId(null)} className="px-4 py-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50">取消</button><button onClick={() => startGame(startGameId)} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">确认开始</button></div></div></div>)}
        {rooms.length === 0 ? <div className="text-center py-12 text-gray-400">暂无游戏局</div> : (
          <div className="space-y-4">
            {rooms.map((room: any) => {
              const status = statusLabel(room.status); const players = roomPlayers[room.id] || []
              const isPlaying = room.status === 'playing'
              const isWaiting = room.status === 'waiting'
              return (
                <div key={room.id} className={`p-5 rounded-lg border shadow-sm ${isWaiting ? 'bg-gray-50 border-gray-200' : isPlaying ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-gray-900">{room.name || '未命名房间'}</h3>
                      <span className={`text-sm font-medium ${status.color}`}>{status.text}</span>
                      <span className={`text-sm ${isPlaying ? 'text-red-400' : 'text-gray-400'}`}>{players.length}/6人</span>
                    </div>
                  </div>
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {isWaiting && <button onClick={() => setStartGameId(room.id)} className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700">开始游戏</button>}
                    {isPlaying && <button onClick={() => router.push(`/game/${room.id}/gm`)} className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700">进入游戏</button>}
                    {room.status === 'finished' && <button onClick={() => openResult(room.id)} className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600">查看排名</button>}
                    {deleteRoomId === room.id ? (
                      <div className="flex items-center gap-2"><span className="text-sm text-red-600">确认删除？</span><button onClick={() => deleteRoom(room.id)} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">确认</button><button onClick={() => setDeleteRoomId(null)} className="px-2 py-1 text-xs border border-gray-300 text-gray-500 rounded hover:bg-gray-100">取消</button></div>
                    ) : (
                      <button onClick={() => setDeleteRoomId(room.id)} className={`px-3 py-1 text-sm border rounded ${isPlaying ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-gray-300 text-gray-500 hover:bg-gray-100'}`}>删除</button>
                    )}
                  </div>
                  {players.length > 0 && (
                    <div>
                      <p className={`text-xs mb-1 ${isPlaying ? 'text-red-400' : 'text-gray-400'}`}>当前玩家：</p>
                      <div className="flex flex-wrap gap-2">
                        {players.map((player: any) => (
                          <div key={player.user_id} className={`flex items-center gap-1 rounded px-2 py-1 text-sm ${isPlaying ? 'bg-red-100 text-red-700 font-medium' : 'bg-white border border-gray-200 text-gray-700'}`}>
                            <span>{player.users?.username}</span>
                            {isWaiting && <button onClick={() => setKickTarget({ roomId: room.id, userId: player.user_id, username: player.users?.username })} className="text-gray-400 hover:text-red-500 ml-1">✕</button>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {showResult && (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto"><h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">最终排名</h3><div className="space-y-2 mb-4">{resultData.map((p: any, i: number) => (<div key={p.user_id} className="flex items-center gap-3 bg-gray-50 p-2 rounded"><span className="text-xl font-bold w-10">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span><span className="flex-1 text-sm text-gray-900">{p.users?.username}</span><span className="text-xs text-gray-500">💰{p.money} ⭐{p.score}</span></div>))}</div><button onClick={() => setShowResult(null)} className="w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">关闭</button></div></div>)}
      </div>
    </div>
  )
}