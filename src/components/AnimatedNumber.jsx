import { useEffect, useRef, useState } from 'react'

// Counts from previous value to current value with rAF easing.
export default function AnimatedNumber({ value, duration = 600, className }) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const startRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    fromRef.current = display
    startRef.current = null
    const target = value

    const tick = (t) => {
      if (startRef.current == null) startRef.current = t
      const p = Math.min(1, (t - startRef.current) / duration)
      // easeOutCubic
      const e = 1 - Math.pow(1 - p, 3)
      const v = Math.round(fromRef.current + (target - fromRef.current) * e)
      setDisplay(v)
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return <span className={className}>{display}</span>
}
