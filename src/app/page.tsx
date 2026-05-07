'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [isLogin, setIsLogin] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      if (isLogin) {
        const { data: user, error: loginError } = await supabase
          .from('users')
          .select('*')
          .eq('username', username)
          .eq('password', password)
          .single()

        if (loginError || !user) {
          setError('用户名或密码错误')
          return
        }

        localStorage.setItem('currentUser', JSON.stringify(user))

        if (user.role === 'gm') {
          router.push('/gm/dashboard')
        } else {
          router.push('/players/dashboard')
        }
      } else {
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('username', username)
          .single()

        if (existingUser) {
          setError('用户名已存在')
          return
        }

        const { error: insertError } = await supabase
          .from('users')
          .insert({ username, password, role: 'player' })

        if (insertError) throw insertError

        setError('注册成功！请登录')
        setIsLogin(true)
        return
      }
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-lg border border-red-100">
        <h1 className="text-3xl font-bold mb-6 text-center text-red-700">华足自走棋</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1 text-gray-700">用户名</label><input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full p-2 rounded border border-gray-300 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none text-gray-900" required placeholder="请输入用户名" /></div>
          <div><label className="block text-sm font-medium mb-1 text-gray-700">密码</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-2 rounded border border-gray-300 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none text-gray-900" required placeholder="请输入密码" /></div>
          {error && <div className={`text-sm p-2 rounded ${error.includes('成功') ? 'text-green-700 bg-green-50 border border-green-200' : 'text-red-700 bg-red-50 border border-red-200'}`}>{error}</div>}
          <button type="submit" className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded font-medium transition-colors">{isLogin ? '登录' : '注册'}</button>
        </form>
        <button onClick={() => setIsLogin(!isLogin)} className="w-full mt-4 text-sm text-red-600 hover:text-red-800">{isLogin ? '没有账号？点击注册' : '已有账号？点击登录'}</button>
      </div>
    </main>
  )
}