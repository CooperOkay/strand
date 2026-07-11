export let currentTracker: (() => void) | null = null

const deps = new Map<object, Map<string | symbol, Set<() => void>>>()
const p2t = new Map<object, object>()
const t2p = new Map<object, object>()
const pending = new Set<() => void>()

let batching = 0
let draining = false

function drain() {
  if (batching > 0 || draining) return
  draining = true
  try {
    while (pending.size > 0) {
      const xs = [...pending]
      pending.clear()
      for (const fn of xs) fn()
    }
  } finally {
    draining = false
  }
}

function hasProxy(v: unknown) {
  return typeof v === 'object' && v !== null && p2t.has(v)
}

export function reactive<T extends object>(target: T): T {
  const seen = t2p.get(target)
  if (seen) return seen as T
  if (hasProxy(target)) return target

  const proxy = new Proxy(target, {
    get(_t, key, recv) {
      if (currentTracker) {
        let pm = deps.get(target)
        if (!pm) deps.set(target, pm = new Map())
        let s = pm.get(key)
        if (!s) pm.set(key, s = new Set())
        s.add(currentTracker)
      }
      const v = Reflect.get(target, key, recv)
      if (v && typeof v === 'object' && !hasProxy(v) && !t2p.has(v)) return reactive(v)
      return v
    },
    set(_t, key, val, recv) {
      const old = Reflect.get(target, key)
      const ok = Reflect.set(target, key, val, recv)
      if (old !== val) {
        const pm = deps.get(target)
        if (pm) {
          const s = pm.get(key)
          if (s) {
            for (const fn of s) pending.add(fn)
            drain()
          }
        }
      }
      return ok
    },
    deleteProperty(_t, key) {
      const ok = Reflect.deleteProperty(target, key)
      const pm = deps.get(target)
      if (pm) {
        const s = pm.get(key)
        if (s) {
          for (const fn of s) pending.add(fn)
          drain()
        }
      }
      return ok
    },
  })

  p2t.set(proxy, target)
  t2p.set(target, proxy)
  return proxy
}

export function isReactive(v: unknown) {
  return hasProxy(v)
}

export function raw<T>(proxy: T): T {
  if (typeof proxy !== 'object' || proxy === null) return proxy
  return (p2t.get(proxy) ?? proxy) as T
}

export function auto(fn: () => void): () => void {
  let done = false
  const run = () => {
    if (done) return
    for (const pm of deps.values())
      for (const s of pm.values()) s.delete(run)
    const prev = currentTracker
    currentTracker = run
    try { fn() } finally { currentTracker = prev }
  }
  run()
  return () => {
    done = true
    for (const pm of deps.values())
      for (const s of pm.values()) s.delete(run)
    pending.delete(run)
  }
}

export function batch(fn: () => void) {
  batching++
  try { fn() } finally { batching--; if (!batching && pending.size > 0) drain() }
}

export function effect(fn: () => void): () => void {
  let done = false
  let dispose: (() => void) | null = null
  const go = () => {
    if (done) return
    dispose?.()
    if (done) return
    dispose = auto(() => { if (!done) fn() })
  }
  queueMicrotask(go)
  return () => { done = true; dispose?.() }
}
