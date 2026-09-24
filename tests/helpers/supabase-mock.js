/**
 * In-memory Supabase fake.
 *
 * The repo's modules instantiate their Supabase client at module scope (or
 * cache it on first use), so tests mock `createClient` at the client-creation
 * layer and hand back this fake. It implements the small subset of the
 * PostgREST builder the codebase actually uses:
 *
 *   from(table).select(cols).eq(col, val).single()/.maybeSingle()
 *   from(table).insert(rowOrRows).select().single()
 *   from(table).update(payload).eq(...)[.select()][.single()]
 *   from(table).upsert(payload).select()
 *
 * awaiting the chain resolves { data, error } like the real client, including
 * PGRST116 semantics: `.single()` with 0 rows yields an error, `.maybeSingle()`
 * yields { data: null, error: null }.
 *
 * Usage in a test file:
 *   vi.mock('@supabase/supabase-js', async () => {
 *     const { createSupabaseMockModule } = await import('../helpers/supabase-mock.js');
 *     return createSupabaseMockModule();
 *   });
 *   // in the test body:
 *   const sb = getSupabaseMock();  // same-file singleton
 *   sb.state.tables.users.push({ id: 'u1', email: 'a@b.com', daily_usage: 3 });
 */
import { vi } from 'vitest';

const PGRST116 = { code: 'PGRST116', message: 'No rows found (single() with 0 rows)' };

function clone(row) {
  return JSON.parse(JSON.stringify(row, (_, v) => (v instanceof Date ? v.toISOString() : v)));
}

let singleton = null;

export function getSupabaseMock() {
  return singleton;
}

export function createSupabaseMockModule() {
  const state = {
    tables: { users: [], ip_usage: [] },
    // Table-level error injection: any query against the table returns this
    // error instead of executing.
    errors: {},
    // Log of mutating operations for assertions: { table, action, payload, filters }
    ops: [],
  };

  function reset() {
    state.tables = { users: [], ip_usage: [] };
    state.errors = {};
    state.ops = [];
  }

  function makeBuilder(table) {
    const op = {
      table,
      filters: [],
      action: 'select',
      payload: null,
      single: false,
      maybeSingle: false,
      wantsSelect: false,
    };

    async function run() {
      if (state.errors[table]) {
        return { data: null, error: { ...state.errors[table] } };
      }
      // Update-only error injection: lets a test fail the UPDATE while the
      // preceding SELECT succeeds (routes map those to different status codes).
      if (op.action === 'update' && state.errors.updates) {
        return { data: null, error: { ...state.errors.updates } };
      }
      state.ops.push({
        table,
        action: op.action,
        payload: op.payload ? clone(op.payload) : null,
        filters: op.filters.map(([c, v]) => ({ [c]: v })),
      });

      const rows = state.tables[table];
      const matches = () => rows.filter((r) => op.filters.every(([c, v]) => r[c] === v));

      if (op.action === 'insert') {
        const payload = Array.isArray(op.payload) ? op.payload : [op.payload];
        const inserted = payload.map((p) => clone(p));
        rows.push(...inserted);
        if (op.wantsSelect) return finalize(inserted);
        return { data: null, error: null };
      }

      if (op.action === 'upsert') {
        const payload = Array.isArray(op.payload) ? op.payload[0] : op.payload;
        const keyCol = 'ip_address' in payload ? 'ip_address' : 'email' in payload ? 'email' : 'id';
        const existing = rows.find((r) => r[keyCol] === payload[keyCol]);
        if (existing) Object.assign(existing, clone(payload));
        else rows.push(clone(payload));
        if (op.wantsSelect) return finalize([clone(payload)]);
        return { data: null, error: null };
      }

      if (op.action === 'update') {
        matches().forEach((r) => Object.assign(r, clone(op.payload)));
        if (op.wantsSelect) return finalize(matches().map(clone));
        return { data: null, error: null };
      }

      // plain select
      return finalize(matches().map(clone));
    }

    function finalize(list) {
      if (op.single) {
        if (list.length !== 1) return { data: null, error: { ...PGRST116 } };
        return { data: list[0], error: null };
      }
      if (op.maybeSingle) {
        return { data: list.length > 0 ? list[0] : null, error: null };
      }
      return { data: list, error: null };
    }

    const builder = {
      select() {
        op.wantsSelect = true;
        return builder;
      },
      eq(col, val) {
        op.filters.push([col, val]);
        return builder;
      },
      insert(payload) {
        op.action = 'insert';
        op.payload = payload;
        return builder;
      },
      update(payload) {
        op.action = 'update';
        op.payload = payload;
        return builder;
      },
      upsert(payload) {
        op.action = 'upsert';
        op.payload = payload;
        return builder;
      },
      delete() {
        op.action = 'delete';
        return builder;
      },
      single() {
        op.single = true;
        return builder;
      },
      maybeSingle() {
        op.maybeSingle = true;
        return builder;
      },
      then(onFulfilled, onRejected) {
        return run().then(onFulfilled, onRejected);
      },
      catch(onRejected) {
        return run().catch(onRejected);
      },
    };
    return builder;
  }

  const client = {
    from: (table) => makeBuilder(table),
  };

  singleton = {
    state,
    reset,
    client,
  };

  return { createClient: vi.fn(() => client) };
}
