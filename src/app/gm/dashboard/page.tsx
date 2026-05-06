'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function GMDashboard() {
  const [userProfile, setUserProfile] = useState<any>(null)
  const router = useRouter()

  // 重设密码
  const [showResetPwd, setShowResetPwd] = useState(false)
  const [newPwd, setNewPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')

  // 注销
  const [showDelete, setShowDelete] = useState(false)

  useEffect(() => {
    const userStr = localStorage.getItem('currentUser')
    if (!userStr) { router.push('/'); return }
    const user = JSON.parse(userStr)
    if (user.role !== 'gm') { router.push('/dashboard'); return }
    setUserProfile(user)
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
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-lg mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-red-700">华足自走棋 - GM中心</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowResetPwd(true)} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">重设密码</button>
            <button onClick={() => setShowDelete(true)} className="px-3 py-2 text-sm text-red-500 hover:text-red-700">注销</button>
            <button onClick={logout} className="px-4 py-2 border border-red-300 text-red-600 rounded hover:bg-red-50 transition-colors">登出</button>
          </div>
        </div>
        <p className="text-gray-500 mb-8">欢迎，{userProfile.username}（GM）</p>
        <div className="space-y-4">
          <button onClick={() => router.push('/gm/players')} className="w-full p-6 bg-white rounded-lg border border-gray-200 hover:border-red-300 hover:shadow-md text-left transition-all"><div className="text-xl font-semibold mb-1 text-gray-900">球员管理</div><div className="text-gray-500 text-sm">批量添加、删除球员</div></button>
          <button onClick={() => router.push('/gm/accounts')} className="w-full p-6 bg-white rounded-lg border border-gray-200 hover:border-red-300 hover:shadow-md text-left transition-all"><div className="text-xl font-semibold mb-1 text-gray-900">账号管理</div><div className="text-gray-500 text-sm">查看、管理所有账号</div></button>
          <button onClick={() => router.push('/gm/manage-games')} className="w-full p-6 bg-white rounded-lg border border-gray-200 hover:border-red-300 hover:shadow-md text-left transition-all"><div className="text-xl font-semibold mb-1 text-gray-900">游戏管理</div><div className="text-gray-500 text-sm">创建、开始、删除游戏局</div></button>
        </div>
      </div>
      {showResetPwd && (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full mx-4"><h3 className="text-lg font-semibold text-gray-900 mb-4">重设密码</h3><input type="text" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} className="w-full p-2.5 rounded border border-gray-300 text-gray-900 mb-3" placeholder="输入新密码" />{pwdMsg && <p className="text-sm text-green-600 mb-2">{pwdMsg}</p>}<div className="flex gap-2 justify-end"><button onClick={() => { setShowResetPwd(false); setNewPwd(''); setPwdMsg('') }} className="px-4 py-2 border border-gray-300 rounded text-gray-600">取消</button><button onClick={resetPassword} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">确认</button></div></div></div>)}
      {showDelete && (<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full mx-4"><h3 className="text-lg font-semibold text-gray-900 mb-2">确认注销</h3><p className="text-gray-600 mb-4">注销后账号将永久删除，无法恢复。</p><div className="flex gap-2 justify-end"><button onClick={() => setShowDelete(false)} className="px-4 py-2 border border-gray-300 rounded text-gray-600">取消</button><button onClick={deleteAccount} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">确认注销</button></div></div></div>)}
    </div>
  )
}