import { DatabaseSync } from 'node:sqlite'
import { currentTracker } from './index.js'

const TABLE = /\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+[`"']?(\w+)[`"']?/gi

function tables(sql: string) {
  const s = new Set<string>()
  const re = new RegExp(TABLE.source, 'gi')
  let m
  while ((m = re.exec(sql))) s.add(m[1].toLowerCase())
  return s
}

export interface ReactiveSQLite {
  query(strings: TemplateStringsArray | string, ...args: any[]): any[]
  run(strings: TemplateStringsArray | string, ...args: any[]): { changes: number | bigint; lastInsertRowid: number | bigint }
  exec(sql: string): void
  close(): void
  readonly db: DatabaseSync
}

function parseSQL(strings: TemplateStringsArray | string, args: any[]) {
  if (typeof strings === 'string') return { sql: strings, params: args }
  let sql = ''
  const params: any[] = []
  for (let i = 0; i < strings.length; i++) {
    sql += strings[i]
    if (i < args.length) { params.push(args[i]); sql += '?' }
  }
  return { sql, params }
}

export function sqliteFrom(db: DatabaseSync): ReactiveSQLite {
  const subs = new Map<string, Set<() => void>>()

  function zap(sql: string) {
    const hit = new Set<() => void>()
    for (const t of tables(sql)) {
      const s = subs.get(t)
      if (s) for (const fn of s) hit.add(fn)
    }
    if (hit.size) for (const fn of hit) fn()
  }

  function q(sql: string, params: any[]) {
    if (currentTracker) {
      for (const t of tables(sql)) {
        let s = subs.get(t)
        if (!s) subs.set(t, s = new Set())
        s.add(currentTracker)
      }
    }
    return db.prepare(sql).all(...params)
  }

  return {
    query(strings: TemplateStringsArray | string, ...args: any[]) {
      const { sql, params } = parseSQL(strings, args)
      return q(sql, params)
    },
    run(strings: TemplateStringsArray | string, ...args: any[]) {
      const { sql, params } = parseSQL(strings, args)
      const info = db.prepare(sql).run(...params) as any
      if (tables(sql).size > 0) zap(sql)
      return info
    },
    exec(sql: string) {
      if (tables(sql).size > 0) zap(sql)
      db.exec(sql)
    },
    close() { db.close(); subs.clear() },
    get db() { return db },
  }
}
