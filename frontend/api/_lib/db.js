// Small data layer so the same call logic runs on Supabase (the real demo) or on a
// plain Postgres database (local tests). Only four operations are used:
//   select(table, { eq, in, order, limit })   -> rows
//   insert(table, row)                        -> inserted row
//   update(table, match, values)              -> nothing
//   rpc(functionName, args)                   -> rows
//
// Files in api/ whose names start with "_" are not turned into web endpoints by Vercel,
// so nothing here is reachable from the browser.

export function getDb() {
  if (process.env.DATABASE_URL) return pgDb(process.env.DATABASE_URL);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new SetupError(
      "The server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
      "Add them in Vercel (Settings → Environment Variables) or in your local .env file."
    );
  }
  return supabaseDb(url, key);
}

export class SetupError extends Error {}

// ---------------------------------------------------------------- Supabase
let _supabase;
async function supabaseClient(url, key) {
  if (!_supabase) {
    const { createClient } = await import("@supabase/supabase-js");
    _supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return _supabase;
}

function supabaseDb(url, key) {
  const check = ({ data, error }) => {
    if (error) throw new Error(`Database error: ${error.message}`);
    return data;
  };
  return {
    async select(table, opts = {}) {
      const sb = await supabaseClient(url, key);
      let q = sb.from(table).select("*");
      for (const [col, val] of Object.entries(opts.eq || {})) q = q.eq(col, val);
      for (const [col, vals] of Object.entries(opts.in || {})) q = q.in(col, vals);
      if (opts.order) q = q.order(opts.order.column, { ascending: opts.order.ascending !== false });
      if (opts.limit) q = q.limit(opts.limit);
      return check(await q);
    },
    async insert(table, row) {
      const sb = await supabaseClient(url, key);
      return check(await sb.from(table).insert(row).select().single());
    },
    async update(table, match, values) {
      const sb = await supabaseClient(url, key);
      let q = sb.from(table).update(values);
      for (const [col, val] of Object.entries(match)) q = q.eq(col, val);
      check(await q);
    },
    async rpc(fn, args) {
      const sb = await supabaseClient(url, key);
      return check(await sb.rpc(fn, args)) || [];
    },
  };
}

// ---------------------------------------------------------------- plain Postgres
let _pool;
function pgDb(connectionString) {
  const pool = async () => {
    if (!_pool) {
      const pg = (await import("pg")).default;
      _pool = new pg.Pool({ connectionString, max: 3 });
    }
    return _pool;
  };
  const ident = (s) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`bad identifier ${s}`);
    return s;
  };
  return {
    async select(table, opts = {}) {
      const where = [], params = [];
      for (const [col, val] of Object.entries(opts.eq || {})) {
        params.push(val); where.push(`${ident(col)} = $${params.length}`);
      }
      for (const [col, vals] of Object.entries(opts.in || {})) {
        params.push(vals); where.push(`${ident(col)} = any($${params.length})`);
      }
      let sql = `select * from ${ident(table)}`;
      if (where.length) sql += ` where ${where.join(" and ")}`;
      if (opts.order) sql += ` order by ${ident(opts.order.column)} ${opts.order.ascending === false ? "desc" : "asc"}`;
      if (opts.limit) sql += ` limit ${Number(opts.limit)}`;
      return (await (await pool()).query(sql, params)).rows;
    },
    async insert(table, row) {
      const cols = Object.keys(row);
      const sql = `insert into ${ident(table)} (${cols.map(ident).join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning *`;
      return (await (await pool()).query(sql, cols.map((c) => jsonish(row[c])))).rows[0];
    },
    async update(table, match, values) {
      const params = [];
      const sets = Object.entries(values).map(([c, v]) => { params.push(jsonish(v)); return `${ident(c)} = $${params.length}`; });
      const where = Object.entries(match).map(([c, v]) => { params.push(v); return `${ident(c)} = $${params.length}`; });
      await (await pool()).query(`update ${ident(table)} set ${sets.join(", ")} where ${where.join(" and ")}`, params);
    },
    async rpc(fn, args) {
      const names = Object.keys(args);
      const sql = `select * from ${ident(fn)}(${names.map((n, i) => `${ident(n)} => $${i + 1}`).join(", ")})`;
      return (await (await pool()).query(sql, names.map((n) => args[n]))).rows;
    },
    async close() { if (_pool) { await _pool.end(); _pool = null; } },
  };
}

function jsonish(v) {
  return v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;
}
