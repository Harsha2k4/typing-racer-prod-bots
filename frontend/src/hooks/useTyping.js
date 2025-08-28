import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../utils/api'

export function useTyping(){
  const [text, setText] = useState('')
  const [cursor, setCursor] = useState(0)
  const [typed, setTyped] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [startedAt, setStartedAt] = useState(null)
  const [paused, setPaused] = useState(true)

  const computeWPM = (chars, ms) => {
    if(!ms || ms <= 0) return 0
    const words = chars/5
    const minutes = ms/60000
    return Math.max(0, Math.round(words/minutes))
  }
  const computeAcc = (corr, total) => total === 0 ? 100 : Math.max(0, Math.min(100, Math.round((corr/total)*100)))

  const wpm = computeWPM(typed, startedAt ? (Date.now()-startedAt) : 0)
  const acc = computeAcc(correct, typed)
  const prog = Math.min(100, Math.round((cursor/Math.max(text.length,1))*100))

  const fetchText = async (n=220) => {
    try{ const r = await api.get('/api/text', null, { words: n }); return r.data.text }
    catch(e){ return 'the quick brown fox jumps over the lazy dog '.repeat(20) }
  }

  const startNew = useCallback(async()=>{
    const t = await fetchText(220)
    setText(t); setCursor(0); setTyped(0); setCorrect(0); setStartedAt(Date.now()); setPaused(false)
  },[])

  const ensureMore = useCallback(async()=>{
    if(text.length - cursor < 50){
      const more = await fetchText(180)
      setText(prev => prev + ' ' + more)
    }
  },[text, cursor])

  const handleKey = useCallback((e)=>{
    if(paused) return
    const ch = e.key.length === 1 ? e.key : (e.key === ' ' ? ' ' : '')
    if(!ch) return
    e.preventDefault()
    const expected = text[cursor]
    setTyped(v=>v+1); if(ch === expected) setCorrect(v=>v+1)
    setCursor(v=>v+1)
    ensureMore()
  },[paused, text, cursor, ensureMore])

  const pauseToggle = ()=> setPaused(p=>!p)

  return { text, cursor, wpm, acc, prog, startNew, pauseToggle, ensureMore, handleKey }
}
