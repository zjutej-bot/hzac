'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function ManageAccounts() {
  const router = useRouter()
  const [userProfile, setUserProfile] = useState<any>(null)
  const [players, setPlayers] = useState<any[]>([])
  const [gms, setGms] = useState<any[]>([])
  const [message, setMessage] = useState('')
  const [showPassword, setShowPassword] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [promoteUserId, setPromoteUserId] = useState<string | null>(null)

  useEffect(() => {
    const userStr = localStorage.getItem('currentUser')
    if (!userStr) { router.push('/'); return }
    const user = JSON.parse(userStr)
    if (user.role !== 'gm') { router.push('/dashboard'); return }
    setUserProfile(user)
    fetchAccounts()
  }, [])

  const fetchAccounts = async () => {
    const { data } = await supabase.from('users').select('*').order('created_at', { ascending: false })
    if (data) {
      setPlayers(data.filter(u => u.role === 'player'))
      setGms(data.filter(u => u.role === 'gm'))
    }
  }

  const togglePassword = (userId: string) => {
    const newSet = new Set(showPassword)
    newSet.has(userId) ? newSet.delete(userId) : newSet.add(userId)
    setShowPassword(newSet)
  }

  const deletePlayer = async (userId: string) => {
    await supabase.from('room_players').delete().eq('user_id', userId)
    await supabase.from('draft_records').delete().eq('user_id', userId)
    const { error } = await supabase.from('users').delete().eq('id', userId)
    if (error) setMessage('删除失败: ' + error.message)
    else { setMessage('账号已删除'); fetchAccounts() }
    setConfirmDelete(null)
  }

  const resetPassword = async (userId: string) => {
    if (!newPassword.trim()) { setMessage('请输入新密码'); return }
    await supabase.from('users').update({ password: newPassword.trim() }).eq('id', userId)
    setMessage('密码已重设'); setResetUserId(null); setNewPassword(''); fetchAccounts()
  }

  const promoteToGM = async (userId: string) => {
    await supabase.from('users').update({ role: 'gm' }).eq('id', userId)
    setMessage('已转为GM'); setPromoteUserId(null); fetchAccounts()
  }

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-red-700">账号管理</h1>
          <button onClick={() => router.push('/gm/dashboard')} className="px-4 py-2 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 transition-colors">返回GM中心</button>
        </div>

        {message && <div className={`mb-4 p-3 rounded border ${message.includes('成功') || message.includes('已') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{message}<button onClick={() => setMessage('')} className="ml-2 text-sm underline">关闭</button></div>}

        {/* 玩家账号 */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4"><h2 className="text-lg font-semibold text-gray-900">玩家账号</h2><span className="text-sm text-gray-400">{players.length}人</span></div>
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-600">
              <div className="col-span-1">#</div><div className="col-span-2">用户名</div><div className="col-span-2">密码</div><div className="col-span-3">注册时间</div><div className="col-span-4 text-right">操作</div>
            </div>
            {players.length === 0 ? <div className="px-6 py-8 text-center text-gray-400">暂无玩家账号</div> : players.map((player, index) => (
              <div key={player.id} className="px-6 py-3 border-b border-gray-100 hover:bg-gray-50">
                <div className="grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-1 text-gray-400 text-sm">{index + 1}</div>
                  <div className="col-span-2 text-gray-900 font-medium truncate">{player.username}</div>
                  <div className="col-span-2 text-gray-600"><span>{showPassword.has(player.id) ? player.password : '••••••'}</span><button onClick={() => togglePassword(player.id)} className="ml-2 text-xs text-red-500 hover:text-red-700">{showPassword.has(player.id) ? '隐藏' : '显示'}</button></div>
                  <div className="col-span-3 text-gray-500 text-sm">{new Date(player.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                  <div className="col-span-4 flex items-center justify-end gap-2">
                    {promoteUserId === player.id ? (
                      <div className="flex items-center gap-1"><span className="text-xs text-gray-500">转为GM？</span><button onClick={() => promoteToGM(player.id)} className="px-2 py-0.5 text-xs bg-green-600 text-white rounded hover:bg-green-700">确认</button><button onClick={() => setPromoteUserId(null)} className="px-2 py-0.5 text-xs border border-gray-300 rounded">取消</button></div>
                    ) : (
                      <button onClick={() => setPromoteUserId(player.id)} className="text-sm text-green-600 hover:text-green-800">转为GM</button>
                    )}
                    <button onClick={() => setResetUserId(resetUserId === player.id ? null : player.id)} className="text-sm text-blue-500 hover:text-blue-700">重设密码</button>
                    {confirmDelete === player.id ? (
                      <><button onClick={() => deletePlayer(player.id)} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">确认删除</button><button onClick={() => setConfirmDelete(null)} className="px-2 py-1 text-xs border border-gray-300 text-gray-500 rounded hover:bg-gray-100">取消</button></>
                    ) : (
                      <button onClick={() => setConfirmDelete(player.id)} className="text-sm text-red-500 hover:text-red-700">删除</button>
                    )}
                  </div>
                </div>
                {resetUserId === player.id && (
                  <div className="mt-3 flex items-center gap-2 pl-12"><input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="p-1.5 rounded border border-gray-300 text-gray-900 text-sm focus:border-red-500 outline-none" placeholder="输入新密码" /><button onClick={() => resetPassword(player.id)} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">确认</button><button onClick={() => { setResetUserId(null); setNewPassword('') }} className="px-3 py-1.5 text-sm border border-gray-300 text-gray-500 rounded hover:bg-gray-100">取消</button></div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* GM账号 */}
        <div>
          <div className="flex items-center gap-2 mb-4"><h2 className="text-lg font-semibold text-gray-900">GM账号</h2><span className="text-sm text-gray-400">{gms.length}人</span></div>
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="grid grid-cols-10 gap-4 px-6 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-600">
              <div className="col-span-1">#</div><div className="col-span-3">用户名</div><div className="col-span-3">密码</div><div className="col-span-3">注册时间</div>
            </div>
            {gms.length === 0 ? <div className="px-6 py-8 text-center text-gray-400">暂无GM账号</div> : gms.map((gm, index) => (
              <div key={gm.id} className={`px-6 py-3 border-b border-gray-100 ${gm.id === userProfile?.id ? 'bg-red-50' : ''}`}>
                <div className="grid grid-cols-10 gap-4 items-center">
                  <div className="col-span-1 text-gray-400 text-sm">{index + 1}</div>
                  <div className="col-span-3 text-gray-900 font-medium truncate">{gm.username}{gm.id === userProfile?.id ? <span className="text-xs text-red-500 ml-1">(我)</span> : ''}</div>
                  <div className="col-span-3 text-gray-600"><span>{showPassword.has(gm.id) ? gm.password : '••••••'}</span><button onClick={() => togglePassword(gm.id)} className="ml-2 text-xs text-gray-400 hover:text-gray-600">{showPassword.has(gm.id) ? '隐藏' : '显示'}</button></div>
                  <div className="col-span-3 text-gray-500 text-sm">{new Date(gm.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}