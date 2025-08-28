import React, { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './utils/api'
import { useTyping } from './hooks/useTyping'
import { useRaceSocket } from './hooks/useWebSocket'

const Box = ({children}) => <div className="bg-white rounded-2xl shadow p-4">{children}</div>

export default function App(){
  const [token, setToken] = useState(null)
  const [me, setMe] = useState(null)

  // Auth
  async function register(e){
    e.preventDefault()
    const f = new FormData(e.target)
    await api.post('/api/auth/register', null, { params: Object.fromEntries(f) })
    alert('Registered, now login')
  }
  async function login(e){
    e.preventDefault()
    const f = new FormData(e.target)
    const res = await api.post('/api/auth/login', new URLSearchParams({ username: f.get('username'), password: f.get('password') }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }})
    setToken(res.data.access_token); localStorage.setItem('token', res.data.access_token)
  }
  useEffect(() => { const t = localStorage.getItem('token'); if (t) setToken(t) }, [])
  useEffect(() => { (async()=>{ if(!token) return setMe(null); const r = await api.get('/api/me', token); setMe(r.data) })() }, [token])

  // Typing
  const { text, cursor, wpm, acc, prog, startNew, pauseToggle, ensureMore, handleKey } = useTyping()
  useEffect(() => {
    const onKey = (e)=>{
      if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return
      handleKey(e)
    }
    window.addEventListener('keydown', onKey)
    return ()=>window.removeEventListener('keydown', onKey)
  }, [handleKey])

  // Race
  const [raceCode, setRaceCode] = useState('')
  const [name, setName] = useState('')
  const [botCount, setBotCount] = useState(0)
  const [difficulty, setDifficulty] = useState('medium')
  const { players, info, winner, startCountdown, join, started } = useRaceSocket({ token, name, onStart: startNew })

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 text-gray-900">
      <h1 className="text-3xl md:text-4xl font-semibold">⌨️ Typing Racer — Production Bots</h1>
      <p className="text-sm text-gray-500 mt-1">FastAPI + WebSockets + React + Tailwind + JWT + AI bots</p>

      <div className="grid md:grid-cols-3 gap-4 mt-6">
        <Box>
          <h2 className="font-semibold mb-2">Account</h2>
          <form onSubmit={register} className="space-y-2">
            <input name="username" placeholder="Username" className="w-full border rounded-xl px-3 py-2" />
            <input name="email" placeholder="Email" className="w-full border rounded-xl px-3 py-2" />
            <input name="password" type="password" placeholder="Password" className="w-full border rounded-xl px-3 py-2" />
            <button className="px-3 py-2 rounded-xl bg-emerald-600 text-white w-full">Register</button>
          </form>
          <form onSubmit={login} className="space-y-2 mt-4">
            <input name="username" placeholder="Username" className="w-full border rounded-xl px-3 py-2" />
            <input name="password" type="password" placeholder="Password" className="w-full border rounded-xl px-3 py-2" />
            <button className="px-3 py-2 rounded-xl bg-indigo-600 text-white w-full">Login</button>
          </form>
          <div className="text-sm text-gray-600 mt-3">{me ? `Logged in as @${me.username}` : 'Not logged in.'}</div>
        </Box>

        <Box>
          <div className="flex gap-2 mb-3">
            <button onClick={()=>startNew()} className="px-3 py-2 rounded-xl bg-blue-600 text-white">Start New</button>
            <button onClick={()=>pauseToggle()} className="px-3 py-2 rounded-xl bg-gray-200">Pause</button>
            <button onClick={()=>ensureMore()} className="px-3 py-2 rounded-xl bg-gray-200">More Text</button>
            <button onClick={async()=>{
              if(!token) return alert('Login first')
              await api.post('/api/tests', null, { params: { wpm, accuracy: acc, duration_sec: 60, chars_typed: Math.round(wpm*5*1) }, token })
              alert('Saved')
            }} className="px-3 py-2 rounded-xl bg-emerald-600 text-white">Save</button>
          </div>
          <div className="mt-2 p-4 rounded-xl bg-gray-100 leading-8 text-lg min-h-[140px] select-none whitespace-pre-wrap">
            <span className="text-gray-400">{text.slice(0, cursor)}</span>
            <span className="bg-blue-200 rounded">{text[cursor] || ' '}</span>
            {text.slice(cursor+1)}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="bg-gray-100 rounded-xl p-3"><div className="text-sm text-gray-500">WPM</div><div className="text-2xl font-semibold">{wpm}</div></div>
            <div className="bg-gray-100 rounded-xl p-3"><div className="text-sm text-gray-500">Accuracy</div><div className="text-2xl font-semibold">{acc}%</div></div>
            <div className="bg-gray-100 rounded-xl p-3"><div className="text-sm text-gray-500">Progress</div><div className="text-2xl font-semibold">{prog}%</div></div>
          </div>
        </Box>

        <Box>
          <h2 className="font-semibold mb-2">Race</h2>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Display name" className="w-full border rounded-xl px-3 py-2 mb-2" />
          <div className="flex gap-2 mb-2">
            <button onClick={async()=>{
              if(!token) return alert('Login first')
              const r = await api.post('/api/race/create', null, { token }); setRaceCode(r.data.race_code)
            }} className="px-3 py-2 rounded-xl bg-emerald-600 text-white">Create Race</button>
            <input value={raceCode} onChange={e=>setRaceCode(e.target.value)} placeholder="Code" className="flex-1 border rounded-xl px-3 py-2" />
            <button onClick={()=>join(raceCode, { bots: botCount, difficulty })} className="px-3 py-2 rounded-xl bg-indigo-600 text-white">Join</button>
          </div>
          <div className="flex gap-2 mb-2">
            <select value={botCount} onChange={e=>setBotCount(Number(e.target.value))} className="border rounded-xl px-3 py-2">
              <option value={0}>0 bots</option>
              <option value={1}>1 bot</option>
              <option value={2}>2 bots</option>
              <option value={3}>3 bots</option>
            </select>
            <select value={difficulty} onChange={e=>setDifficulty(e.target.value)} className="border rounded-xl px-3 py-2">
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <button onClick={()=>startCountdown()} className="px-3 py-2 rounded-xl bg-orange-600 text-white flex-1">Start Countdown</button>
          </div>
          <div className="text-sm text-gray-500">{info}</div>
          <div className="mt-3 space-y-2">
            {players.map(p => (
              <div key={p.id} className="p-2 rounded-xl border">
                <div className="flex justify-between text-sm mb-1">
                  <div className="font-medium">{p.name}{p.is_bot ? ' 🤖' : ''}</div>
                  <div>{p.wpm} wpm • {p.accuracy}% • {p.progress}%</div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="h-2 rounded-full bg-blue-600" style={{width:`${p.progress}%`}}></div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-center text-lg font-semibold text-green-700">{winner ? `🏁 Winner: ${winner}` : ''}</div>
        </Box>
      </div>

      <Box>
        <h2 className="font-semibold mb-2">Leaderboard</h2>
        <button onClick={async()=>{
          const r = await api.get('/api/leaderboard/top'); window.alert(JSON.stringify(r.data, null, 2))
        }} className="px-3 py-2 rounded-xl bg-gray-200">Show Top</button>
        <button onClick={async()=>{
          if(!token) return alert('Login first')
          const r = await api.get('/api/tests/my', token); window.alert('My tests:\\n'+JSON.stringify(r.data, null, 2))
        }} className="px-3 py-2 rounded-xl bg-gray-200 ml-2">Show My Tests</button>
      </Box>
    </div>
  )
}
