'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function ManageAccounts() {
  const router = useRouter()
  const [userProfile, setUserProfile] = useState<any>(null)
  const [players, setPlayers] = useState<any[]>([])
  const [gms, setGms] = useState<any[]>([])
  const [showPassword, setShowPassword] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [promoteUserId, setPromoteUserId] = useState<string | null>(null)

  useEffect(() => {
    const userStr = localStorage.getItem('currentUser')
    if (!userStr) { router.push('/'); return }
    const user = JSON.parse(userStr)
    if (user.role !== 'gm') { router.push('/players/dashboard'); return }
    setUserProfile(user)
    fetchAccounts()
  }, [])

  const fetchAccounts = async () => {
    const { data } = await supabase.from('users').select('*').order('id', { ascending: true })
    if (data) {
      setPlayers(data.filter(u => u.role === 'player'))
      setGms(data.filter(u => u.role === 'gm'))
    }
  }

  const togglePassword = (userId: string) => {
    setShowPassword(prev => {
      const ns = new Set(prev)
      ns.has(userId) ? ns.delete(userId) : ns.add(userId)
      return ns
    })
  }

  const deletePlayer = async (userId: string) => {
    await supabase.from('players_pool').update({ owner_id: null, status: 'available' }).eq('owner_id', userId)
    await supabase.from('users').delete().eq('id', userId)
    setConfirmDelete(null)
    fetchAccounts()
  }

  const deleteGM = async (userId: string) => {
    await supabase.from('players_pool').update({ owner_id: null, status: 'available' }).eq('owner_id', userId)
    await supabase.from('users').delete().eq('id', userId)
    if (userId === userProfile?.id) {
      localStorage.removeItem('currentUser')
      router.push('/')
    } else {
      fetchAccounts()
    }
  }

  const resetPassword = async (userId: string) => {
    if (!newPassword.trim()) return
    await supabase.from('users').update({ password: newPassword.trim() }).eq('id', userId)
    if (userId === userProfile?.id) {
      localStorage.removeItem('currentUser')
      router.push('/')
    } else {
      setResetUserId(null)
      setNewPassword('')
      fetchAccounts()
    }
  }

  const promoteToGM = async (userId: string) => {
    await supabase.from('users').update({ role: 'gm' }).eq('id', userId)
    setPromoteUserId(null)
    fetchAccounts()
  }

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-red-700">账号管理</h1>
          <button onClick={() => router.push('/gm/dashboard')} className="px-4 py-2 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 transition-colors">返回GM中心</button>
        </div>

        {/* 玩家账号 */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4"><h2 className="text-lg font-semibold text-gray-900">玩家账号</h2><span className="text-sm text-gray-400">{players.length}人</span></div>
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="grid grid-cols-4 px-6 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-600 text-center">
              <div>#</div><div>用户名</div><div>密码</div><div>操作</div>
            </div>
            {players.length === 0 ? <div className="px-6 py-8 text-center text-gray-400">暂无玩家账号</div> : players.map((player, index) => (
              <div key={player.id} className="px-6 py-2 border-b border-gray-100 hover:bg-gray-50">
                <div className="grid grid-cols-4 items-center text-center text-sm">
                  <div className="text-gray-400">{index + 1}</div>
                  <div className="text-gray-900 font-medium truncate">{player.username}</div>
                  <div className="text-gray-600">
                    <span>{showPassword.has(player.id) ? player.password : '••••••'}</span>
                    <button onClick={() => togglePassword(player.id)} className="ml-1 text-xs text-gray-400 hover:text-gray-600">{showPassword.has(player.id) ? '隐藏' : '显示'}</button>
                  </div>
                  <div className="flex items-center justify-center gap-1 flex-wrap">
                    {promoteUserId === player.id ? (
                      <><span className="text-xs text-gray-500">转为GM？</span><button onClick={() => promoteToGM(player.id)} className="px-2 py-0.5 text-xs bg-green-600 text-white rounded hover:bg-green-700">确认</button><button onClick={() => setPromoteUserId(null)} className="px-2 py-0.5 text-xs border border-gray-300 rounded">取消</button></>
                    ) : (
                      <button onClick={() => setPromoteUserId(player.id)} className="text-xs text-green-600 hover:text-green-800">转为GM</button>
                    )}
                    <button onClick={() => setResetUserId(resetUserId === player.id ? null : player.id)} className="text-xs text-blue-500 hover:text-blue-700">重设密码</button>
                    {confirmDelete === player.id ? (
                      <><button onClick={() => deletePlayer(player.id)} className="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-700">确认</button><button onClick={() => setConfirmDelete(null)} className="px-2 py-0.5 text-xs border border-gray-300 rounded">取消</button></>
                    ) : (
                      <button onClick={() => setConfirmDelete(player.id)} className="text-xs text-red-500 hover:text-red-700">删除</button>
                    )}
                  </div>
                </div>
                {resetUserId === player.id && (
                  <div className="mt-2 flex items-center justify-center gap-2"><input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="p-1.5 rounded border border-gray-300 text-gray-900 text-sm outline-none w-32" placeholder="新密码" /><button onClick={() => resetPassword(player.id)} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">确认</button><button onClick={() => { setResetUserId(null); setNewPassword('') }} className="px-3 py-1 text-sm border border-gray-300 text-gray-500 rounded hover:bg-gray-100">取消</button></div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* GM账号 */}
        <div>
          <div className="flex items-center gap-2 mb-4"><h2 className="text-lg font-semibold text-gray-900">GM账号</h2><span className="text-sm text-gray-400">{gms.length}人</span></div>
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="grid grid-cols-4 px-6 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-600 text-center">
              <div>#</div><div>用户名</div><div>密码</div><div>操作</div>
            </div>
            {gms.length === 0 ? <div className="px-6 py-8 text-center text-gray-400">暂无GM账号</div> : gms.map((gm, index) => (
              <div key={gm.id} className={`px-6 py-2 border-b border-gray-100 ${gm.id === userProfile?.id ? 'bg-red-50' : ''}`}>
                <div className="grid grid-cols-4 items-center text-center text-sm">
                  <div className="text-gray-400">{index + 1}</div>
                  <div className="text-gray-900 font-medium truncate">{gm.username}{gm.id === userProfile?.id ? <span className="text-xs text-red-500 ml-1">(我)</span> : ''}</div>
                  <div className="text-gray-600">
                    <span>{showPassword.has(gm.id) ? gm.password : '••••••'}</span>
                    <button onClick={() => togglePassword(gm.id)} className="ml-1 text-xs text-gray-400 hover:text-gray-600">{showPassword.has(gm.id) ? '隐藏' : '显示'}</button>
                  </div>
                  <div className="flex items-center justify-center gap-1 flex-wrap">
                    {gm.id === userProfile?.id ? (
                      <>
                        <button onClick={() => setResetUserId(resetUserId === gm.id ? null : gm.id)} className="text-xs text-blue-500 hover:text-blue-700">重设密码</button>
                        {confirmDelete === gm.id ? (
                          <><button onClick={() => deleteGM(gm.id)} className="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-700">确认注销</button><button onClick={() => setConfirmDelete(null)} className="px-2 py-0.5 text-xs border border-gray-300 rounded">取消</button></>
                        ) : (
                          <button onClick={() => setConfirmDelete(gm.id)} className="text-xs text-red-500 hover:text-red-700">注销</button>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </div>
                </div>
                {resetUserId === gm.id && (
                  <div className="mt-2 flex items-center justify-center gap-2"><input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="p-1.5 rounded border border-gray-300 text-gray-900 text-sm outline-none w-32" placeholder="新密码" /><button onClick={() => resetPassword(gm.id)} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">确认</button><button onClick={() => { setResetUserId(null); setNewPassword('') }} className="px-3 py-1 text-sm border border-gray-300 text-gray-500 rounded hover:bg-gray-100">取消</button></div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}