'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function PlayerPool() {
  const router = useRouter()
  const [userProfile, setUserProfile] = useState<any>(null)

  const [batchInput, setBatchInput] = useState('')
  const [poolPlayers, setPoolPlayers] = useState<any[]>([])
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set())
  const [selectAll, setSelectAll] = useState(false)

  useEffect(() => {
    const userStr = localStorage.getItem('currentUser')
    if (!userStr) { router.push('/'); return }
    const user = JSON.parse(userStr)
    if (user.role !== 'gm') { router.push('/players/dashboard'); return }
    setUserProfile(user)
    fetchPlayers()
  }, [])

  const fetchPlayers = async () => {
    const BATCH = 1000
    let all: any[] = []
    let start = 0
    while (true) {
      const { data } = await supabase
        .from('players_pool')
        .select('*')
        .order('sort_order', { ascending: true })
        .range(start, start + BATCH - 1)
      if (!data || data.length === 0) break
      all = [...all, ...data]
      if (data.length < BATCH) break
      start += BATCH
    }
    setPoolPlayers(all)
    setSelectedPlayers(new Set())
    setSelectAll(false)
  }

  const batchAddPlayers = async () => {
    if (!batchInput.trim()) return

    const lines = batchInput.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    const players: { name: string; cost: number }[] = []

    for (const line of lines) {
      const match = line.match(/^(.+?)(\d)$/)
      if (match) {
        const name = match[1].trim()
        const cost = parseInt(match[2])
        if (name && cost >= 0 && cost <= 7) players.push({ name, cost })
      }
    }

    if (players.length === 0) return

    const BATCH_SIZE = 500
    for (let i = 0; i < players.length; i += BATCH_SIZE) {
      await supabase.from('players_pool').insert(players.slice(i, i + BATCH_SIZE))
    }
    setBatchInput('')
    fetchPlayers()
  }

  const togglePlayer = (playerId: string) => {
    setSelectedPlayers(prev => {
      const ns = new Set(prev)
      ns.has(playerId) ? ns.delete(playerId) : ns.add(playerId)
      return ns
    })
    setSelectAll(false)
  }

  const toggleSelectAll = () => {
    if (selectAll) { setSelectedPlayers(new Set()); setSelectAll(false) }
    else { setSelectedPlayers(new Set(poolPlayers.map(p => p.id))); setSelectAll(true) }
  }

  const selectByCost = (cost: number) => {
    const costPlayers = poolPlayers.filter(p => p.cost === cost)
    setSelectedPlayers(prev => {
      const ns = new Set(prev)
      costPlayers.forEach(p => ns.add(p.id))
      return ns
    })
    setSelectAll(false)
  }

  const batchDelete = async () => {
    if (selectedPlayers.size === 0) return
    if (!confirm(`确定删除选中的 ${selectedPlayers.size} 名球员吗？`)) return

    const ids = Array.from(selectedPlayers)
    const BATCH_SIZE = 500
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      await supabase.from('players_pool').delete().in('id', ids.slice(i, i + BATCH_SIZE))
    }
    fetchPlayers()
  }

  const deleteByCost = async (cost: number) => {
    const ids = poolPlayers.filter(p => p.cost === cost).map(p => p.id)
    if (ids.length === 0) return
    if (!confirm(`确定删除所有 ${cost} 费球员（共 ${ids.length} 名）吗？`)) return

    const BATCH_SIZE = 500
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      await supabase.from('players_pool').delete().in('id', ids.slice(i, i + BATCH_SIZE))
    }
    fetchPlayers()
  }

  const groupedPlayers: { [cost: number]: any[] } = {}
  poolPlayers.forEach(p => {
    if (!groupedPlayers[p.cost]) groupedPlayers[p.cost] = []
    groupedPlayers[p.cost].push(p)
  })

  if (!userProfile) return <div className="min-h-screen bg-white flex items-center justify-center"><p className="text-gray-500">加载中...</p></div>

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-red-700">球员管理</h1>
          <button onClick={() => router.push('/gm/dashboard')} className="px-4 py-2 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 transition-colors">返回GM中心</button>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm mb-8">
          <h2 className="text-lg font-semibold mb-4 text-gray-900">添加球员</h2>
          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">输入球员（每行一个，名称+费用，如 梅西7）</label>
            <textarea value={batchInput} onChange={(e) => setBatchInput(e.target.value)} className="w-full h-24 p-3 rounded border border-gray-300 text-gray-900 resize-y" placeholder="梅西7&#10;C罗7&#10;姆巴佩6" />
          </div>
          <button onClick={batchAddPlayers} className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors">批量添加</button>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">球员库（共 {poolPlayers.length} 名）</h2>
            <div className="flex gap-2">
              <button onClick={toggleSelectAll} className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-600">{selectAll ? '取消全选' : '全选'}</button>
              <button onClick={batchDelete} disabled={selectedPlayers.size === 0} className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">删除选中 ({selectedPlayers.size})</button>
            </div>
          </div>

          <div className="space-y-6">
            {[0,1,2,3,4,5,6,7].map(cost => {
              const playersOfCost = groupedPlayers[cost] || []
              if (playersOfCost.length === 0) return null
              const allSelected = playersOfCost.every(p => selectedPlayers.has(p.id))
              return (
                <div key={cost}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-red-600">{cost}费（{playersOfCost.length}名）</h3>
                    <div className="flex gap-2">
                      <button onClick={() => selectByCost(cost)} className="text-xs text-red-500 hover:text-red-700">{allSelected ? '已全选' : '全选此费'}</button>
                      <button onClick={() => deleteByCost(cost)} className="text-xs text-gray-400 hover:text-red-500">删除全部</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {playersOfCost.map((player: any) => (
                      <div key={player.id} onClick={() => togglePlayer(player.id)} className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-all ${selectedPlayers.has(player.id) ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}>
                        <input type="checkbox" checked={selectedPlayers.has(player.id)} onChange={() => {}} className="accent-red-600" />
                        <span className="text-sm text-gray-800 truncate">{player.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            {poolPlayers.length === 0 && <div className="text-center py-8 text-gray-400">暂无球员，请在上方添加</div>}
          </div>
        </div>
      </div>
    </div>
  )
}