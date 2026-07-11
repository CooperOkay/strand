# strand

Wrap anything in a reactive proxy. Objects, arrays, SQLite databases. Reads tracked automatically. Writes trigger re-runs. No signals, no stores, no framework.

Rust can't proxy arbitrary access. Go can't intercept property assignment. Python has `__getattr__` but can't trap existing properties. This only works in JavaScript.

```bash
npm install strandjs
```

```ts
import { reactive, auto } from 'strandjs'

const data = reactive({ a: 1, b: 2 })

auto(() => {
  console.log(data.a + data.b)
})

data.a = 5 // logs 7
data.b = 3 // logs 8
```

## How it works

Proxies intercept property access. When `auto(fn)` runs, it records every reactive property the function reads in a dependency graph. When anything writes to one of those properties, every function that depends on it re-runs. Writes inside a `batch()` get coalesced into one run. That's the whole thing.

## SQLite

Wrap a `node:sqlite` DatabaseSync. Queries re-run when tables change.

```ts
import { DatabaseSync } from 'node:sqlite'
import { auto } from 'strandjs'
import { sqliteFrom } from 'strandjs/sqlite'

const db = sqliteFrom(new DatabaseSync(':memory:'))

let rows
auto(() => {
  rows = db.query`SELECT * FROM users`
  render(rows)
})

db.run`INSERT INTO users (name) VALUES ('alice')`
```

No polling. No ORM. The SQLite adapter extracts table names from every query and only invalidates queries that touch the tables being written to.

## API

| Function | Does |
|----------|------|
| `reactive(x)` | Wrap an object or array in a reactive proxy |
| `auto(fn)` | Run fn, track deps, re-run on change. Returns dispose. |
| `batch(fn)` | Defer all re-runs until fn returns |
| `effect(fn)` | Like auto but first run deferred to microtask |
| `isReactive(x)` | Check if something's a reactive proxy |
| `raw(p)` | Unwrap to the underlying target |
| `sqliteFrom(db)` | Wrap a DatabaseSync as reactive |

## Stack

Dep graph is a `Map<target, Map<key, Set<fn>>>`. Re-runs are synchronous by default, batched writes defer to microtask. Core uses `Proxy` and `queueMicrotask` — nothing else. SQLite adapter uses `node:sqlite` (built into Node 22+). Single TypeScript repo, builds with tsup.

## License

MIT
