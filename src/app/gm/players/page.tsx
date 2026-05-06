'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function ManagePlayers() {
  const router = useRouter()
  const [userProfile, setUserProfile] = useState<any>(null)
  const [message, setMessage] = useState('')

  // 球员管理
  const [selectedCost, setSelectedCost] = useState(0)
  const [batchInput, setBatchInput] = useState('')
  const [poolPlayers, setPoolPlayers] = useState<any[]>([])
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set())
  const [selectAll, setSelectAll] = useState(false)

  useEffect(() => {
    const userStr = localStorage.getItem('currentUser')
    if (!userStr) {
      router.push('/')
      return
    }
    const user = JSON.parse(userStr)
    if (user.role !== 'gm') {
      router.push('/dashboard')
      return
    }
    setUserProfile(user)
    fetchPlayers()
  }, [])

  const fetchPlayers = async () => {
  const userStr = localStorage.getItem('currentUser')
  if (!userStr) return
  const user = JSON.parse(userStr)

  const BATCH_SIZE = 1000
  let allPlayers: any[] = []
  let start = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await supabase
      .from('players_pool')
      .select('*', { count: 'exact' })
      .eq('gm_id', user.id)
      .order('cost', { ascending: true })
      .order('name', { ascending: true })
      .range(start, start + BATCH_SIZE - 1)

    if (error) {
      console.error('获取球员失败:', error)
      break
    }

    if (data && data.length > 0) {
      allPlayers = [...allPlayers, ...data]
      start += BATCH_SIZE
      if (data.length < BATCH_SIZE) hasMore = false
    } else {
      hasMore = false
    }
  }

  setPoolPlayers(allPlayers)
  setSelectedPlayers(new Set())
  setSelectAll(false)
}

  // 批量添加球员
  const batchAddPlayers = async () => {
    if (!batchInput.trim()) {
      setMessage('请输入球员名称')
      return
    }

    const userStr = localStorage.getItem('currentUser')
    if (!userStr) return
    const user = JSON.parse(userStr)

    const names = batchInput
      .split('\n')
      .map(name => name.trim())
      .filter(name => name.length > 0)

    if (names.length === 0) {
      setMessage('请输入至少一个球员名称')
      return
    }

    const players = names.map(name => ({
      name,
      cost: selectedCost,
      gm_id: user.id,
    }))

    const { error } = await supabase
      .from('players_pool')
      .insert(players)

    if (error) {
      setMessage('添加失败: ' + error.message)
    } else {
      setMessage(`✅ 成功添加 ${names.length} 名 ${selectedCost} 费球员！`)
      setBatchInput('')
      fetchPlayers()
    }
  }

  // 切换单个球员选中状态
  const togglePlayer = (playerId: string) => {
    const newSet = new Set(selectedPlayers)
    if (newSet.has(playerId)) {
      newSet.delete(playerId)
    } else {
      newSet.add(playerId)
    }
    setSelectedPlayers(newSet)
    setSelectAll(false)
  }

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedPlayers(new Set())
    } else {
      setSelectedPlayers(new Set(poolPlayers.map(p => p.id)))
    }
    setSelectAll(!selectAll)
  }

  // 按费用全选
  const selectByCost = (cost: number) => {
    const costPlayers = poolPlayers.filter(p => p.cost === cost)
    const newSet = new Set(selectedPlayers)
    costPlayers.forEach(p => newSet.add(p.id))
    setSelectedPlayers(newSet)
    setSelectAll(false)
  }

  // 批量删除选中的球员
  const batchDeletePlayers = async () => {
    if (selectedPlayers.size === 0) {
      setMessage('请先选择要删除的球员')
      return
    }

    if (!confirm(`确定要删除选中的 ${selectedPlayers.size} 名球员吗？`)) return

    const ids = Array.from(selectedPlayers)
    const { error } = await supabase
      .from('players_pool')
      .delete()
      .in('id', ids)

    if (error) {
      setMessage('删除失败: ' + error.message)
    } else {
      setMessage(`✅ 成功删除 ${ids.length} 名球员！`)
      fetchPlayers()
    }
  }

  // 按费用批量删除
  const deleteByCost = async (cost: number) => {
    const count = poolPlayers.filter(p => p.cost === cost).length
    if (count === 0) return
    if (!confirm(`确定要删除所有 ${cost} 费球员（共 ${count} 名）吗？`)) return

    const userStr = localStorage.getItem('currentUser')
    if (!userStr) return
    const user = JSON.parse(userStr)

    const ids = poolPlayers.filter(p => p.cost === cost).map(p => p.id)
    await supabase
      .from('players_pool')
      .delete()
      .in('id', ids)

    setMessage(`✅ 已删除所有 ${cost} 费球员（${count} 名）！`)
    fetchPlayers()
  }

  // 按费用分组
  const groupedPlayers: { [cost: number]: any[] } = {}
  poolPlayers.forEach(p => {
    if (!groupedPlayers[p.cost]) groupedPlayers[p.cost] = []
    groupedPlayers[p.cost].push(p)
  })

  if (!userProfile) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-4xl mx-auto">
        {/* 顶部导航 */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-red-700">球员管理</h1>
          <button
            onClick={() => router.push('/gm/dashboard')}
            className="px-4 py-2 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 transition-colors"
          >
            返回GM中心
          </button>
        </div>

        {message && (
          <div className={`mb-4 p-3 rounded border ${
            message.includes('✅')
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {message}
            <button onClick={() => setMessage('')} className="ml-2 text-sm underline">关闭</button>
          </div>
        )}

        {/* 批量添加区域 */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm mb-8">
          <h2 className="text-lg font-semibold mb-4 text-gray-900">添加球员</h2>

          <div className="flex gap-3 mb-4 items-end">
            <div>
              <label className="block text-sm text-gray-600 mb-1">选择费用</label>
              <select
                value={selectedCost}
                onChange={(e) => setSelectedCost(Number(e.target.value))}
                className="p-2 rounded border border-gray-300 text-gray-900 bg-white focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
              >
                {[0, 1, 2, 3, 4, 5, 6, 7].map(cost => (
                  <option key={cost} value={cost}>{cost}费</option>
                ))}
              </select>
            </div>
            <button
              onClick={batchAddPlayers}
              className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              批量添加
            </button>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">
              输入球员名称（每行一个）
            </label>
            <textarea
              value={batchInput}
              onChange={(e) => setBatchInput(e.target.value)}
              className="w-full h-24 p-3 rounded border border-gray-300 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none text-gray-900 resize-y"
              placeholder=""
            />
          </div>
        </div>

        {/* 球员列表区域 */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              球员库（共 {poolPlayers.length} 名）
            </h2>
            <div className="flex gap-2">
              <button
                onClick={toggleSelectAll}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-600 transition-colors"
              >
                {selectAll ? '取消全选' : '全选'}
              </button>
              <button
                onClick={batchDeletePlayers}
                disabled={selectedPlayers.size === 0}
                className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                删除选中 ({selectedPlayers.size})
              </button>
            </div>
          </div>

          {/* 按费用分组显示 */}
          <div className="space-y-6">
            {[0, 1, 2, 3, 4, 5, 6, 7].map(cost => {
              const playersOfCost = groupedPlayers[cost] || []
              const allSelected = playersOfCost.length > 0 && playersOfCost.every(p => selectedPlayers.has(p.id))

              if (playersOfCost.length === 0) return null

              return (
                <div key={cost}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-red-600">{cost}费（{playersOfCost.length}名）</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => selectByCost(cost)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        {allSelected ? '✅ 已全选' : '全选此费'}
                      </button>
                      <button
                        onClick={() => deleteByCost(cost)}
                        className="text-xs text-gray-400 hover:text-red-500"
                      >
                        删除全部
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {playersOfCost.map((player: any) => (
                      <div
                        key={player.id}
                        onClick={() => togglePlayer(player.id)}
                        className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-all ${
                          selectedPlayers.has(player.id)
                            ? 'border-red-400 bg-red-50'
                            : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedPlayers.has(player.id)}
                          onChange={() => {}}
                          className="accent-red-600"
                        />
                        <span className="text-sm text-gray-800 truncate">{player.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {poolPlayers.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                暂无球员，请在上方添加
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}