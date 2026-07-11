import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'

const strand = await import('../dist/index.js')
const sqliteMod = await import('../dist/sqlite.js')
const { reactive, isReactive, raw, auto, batch, effect } = strand
const { sqliteFrom } = sqliteMod

describe('reactive', () => {
  it('wraps a plain object and tracks reads via auto', () => {
    const data = reactive({ a: 1, b: 2 })
    assert.ok(isReactive(data))

    let seen = 0
    const dispose = auto(() => { seen = data.a + data.b })
    assert.equal(seen, 3)

    data.a = 10
    assert.equal(seen, 12)

    data.b = 5
    assert.equal(seen, 15)
    dispose()
  })

  it('stops tracking after dispose', () => {
    const data = reactive({ x: 1 })
    let count = 0
    const dispose = auto(() => { count++; data.x })
    assert.equal(count, 1)
    data.x = 2
    assert.equal(count, 2)
    dispose()
    data.x = 3
    assert.equal(count, 2)
  })

  it('handles multiple reactive objects', () => {
    const a = reactive({ v: 1 })
    const b = reactive({ v: 2 })
    let result = 0
    const dispose = auto(() => { result = a.v + b.v })
    assert.equal(result, 3)
    a.v = 10
    assert.equal(result, 12)
    b.v = 20
    assert.equal(result, 30)
    dispose()
  })

  it('batches multiple mutations into one re-run', () => {
    const data = reactive({ a: 1, b: 1 })
    let runCount = 0
    const dispose = auto(() => { runCount++; data.a + data.b })
    assert.equal(runCount, 1)
    batch(() => {
      data.a = 5
      data.b = 5
    })
    assert.equal(runCount, 2)
    dispose()
  })

  it('tracks arrays', () => {
    const items = reactive([1, 2, 3])
    let sum = 0
    const dispose = auto(() => { sum = items.reduce((a, b) => a + b, 0) })
    assert.equal(sum, 6)
    items[0] = 10
    assert.equal(sum, 15)
    dispose()
  })

  it('supports raw() to get underlying target', () => {
    const target = { a: 1 }
    const proxy = reactive(target)
    assert.equal(raw(proxy), target)
    assert.notEqual(proxy, target)
  })

  it('isReactive returns false for non-objects', () => {
    assert.equal(isReactive(null), false)
    assert.equal(isReactive(42), false)
    assert.equal(isReactive('hello'), false)
    assert.equal(isReactive(undefined), false)
  })

  it('effect defers first run to microtask', async () => {
    const data = reactive({ x: 1 })
    let seen = 0
    effect(() => { seen = data.x })
    assert.equal(seen, 0)
    await new Promise(r => setTimeout(r, 0))
    assert.equal(seen, 1)
  })
})

describe('sqlite', () => {
  it('executes queries and tracks table dependencies', () => {
    const db = sqliteFrom(new DatabaseSync(':memory:'))
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
    db.exec("INSERT INTO users VALUES (1, 'alice'), (2, 'bob')")

    let rows = []
    const dispose = auto(() => { rows = db.query('SELECT * FROM users ORDER BY id') })
    assert.equal(rows.length, 2)

    db.run("INSERT INTO users (name) VALUES ('charlie')")
    assert.equal(rows.length, 3)

    db.run("UPDATE users SET name = 'Alice' WHERE id = 1")
    assert.equal(rows[0].name, 'Alice')

    dispose()
    db.close()
  })

  it('supports tagged template syntax', () => {
    const db = sqliteFrom(new DatabaseSync(':memory:'))
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    db.run`INSERT INTO t (val) VALUES (${'hello'})`

    let rows = []
    const dispose = auto(() => { rows = db.query`SELECT * FROM t` })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].val, 'hello')

    db.run`INSERT INTO t (val) VALUES (${'world'})`
    assert.equal(rows.length, 2)

    dispose()
    db.close()
  })

  it('returns changes info from run', () => {
    const db = sqliteFrom(new DatabaseSync(':memory:'))
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    const info = db.run('INSERT INTO t VALUES (1)')
    assert.equal(info.changes, 1)
    assert.ok(info.lastInsertRowid)
    db.close()
  })

  it('tracks based on table name extraction', () => {
    const db = sqliteFrom(new DatabaseSync(':memory:'))
    db.exec('CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT)')
    db.exec("INSERT INTO products VALUES (1, 'widget')")

    let count = 0
    const dispose = auto(() => {
      count = db.query('SELECT COUNT(*) AS c FROM products')[0].c
    })
    assert.equal(count, 1)

    db.run("INSERT INTO products VALUES (2, 'gadget')")
    assert.equal(count, 2)

    dispose()
    db.close()
  })
})
