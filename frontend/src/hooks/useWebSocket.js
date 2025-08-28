import { useCallback, useEffect, useRef, useState } from 'react'

export function useRaceSocket({ token, name, onStart }){
  const [players, setPlayers] = useState([])
  const [info, setInfo] = useState('Not connected.')
  const [winner, setWinner] = useState(null)
  const [started, setStarted] = useState(false)
  const wsRef = useRef(null)
  const raceCodeRef = useRef(null)

  const join = useCallback((raceCode, { bots=0, difficulty='medium' }={})=>{
    if(wsRef.current){ try{wsRef.current.close()}catch(e){} }
    raceCodeRef.current = raceCode
    const url = new URL((import.meta.env.VITE_API || 'http://127.0.0.1:8000').replace(/^http/,'ws') + `/ws/race/${encodeURIComponent(raceCode)}`)
    if(token) url.searchParams.set('token', token)
    if(name) url.searchParams.set('name', name)
    if(bots) url.searchParams.set('bots', bots)
    if(difficulty) url.searchParams.set('difficulty', difficulty)
    const ws = new WebSocket(url)
    wsRef.current = ws
    setInfo('Connecting...')
    ws.onopen = ()=> setInfo(`Connected to race ${raceCode}`)
    ws.onclose = ()=> setInfo('Disconnected.')
    ws.onerror = ()=> setInfo('Connection error.')
    ws.onmessage = (e)=>{
      const msg = JSON.parse(e.data)
      if(msg.event === 'room:state'){
        setPlayers(msg.data.players || [])
        setStarted(msg.data.started)
      } else if (msg.event === 'room:started'){
        setStarted(true); onStart && onStart()
      } else if (msg.event === 'text:new'){
        // handled by onStart via REST text call; optionally could set here
      } else if (msg.event === 'room:winner'){
        setWinner(msg.data.name)
      }
    }
  }, [token, name, onStart])

  const startCountdown = useCallback(()=>{
    const ws = wsRef.current; if(!ws) return
    ws.send(JSON.stringify({ event: 'room:start', data: { seconds: 3 } }))
  }, [])

  // push local stats (call from outside via window)
  useEffect(()=>{
    const push = (e)=>{
      if(e.detail && wsRef.current && wsRef.current.readyState === WebSocket.OPEN){
        wsRef.current.send(JSON.stringify({ event: 'player:update', data: e.detail }))
      }
    }
    window.addEventListener('typing:stats', push)
    return ()=>window.removeEventListener('typing:stats', push)
  }, [])

  return { players, info, winner, startCountdown, join, started }
}
