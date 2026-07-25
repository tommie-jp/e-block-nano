import type { TraceExpr } from './traceExpr'

/**
 * 「Add Trace」の式パーサ (LTspice の式入力相当)。
 *
 * 文法:
 *   expr   = term (('+'|'-') term)*
 *   term   = unary (('*'|'/') unary)*
 *   unary  = '-'? primary
 *   primary= number | '(' expr ')' | fn '(' args ')'
 *   fn     = V | I | P | abs | sqrt | d
 *
 * ノード名・素子名は呼び出し側の対応表 ({@link ExprSymbols}) で解決する
 * (UI に出ている `N1` / `blk-4` をそのまま打てるようにするため)。
 */

export interface ExprSymbols {
  /** 表示名 → nodeId。無ければ null */
  node(name: string): string | null
  /** 表示名 → blockId。無ければ null */
  block(name: string): string | null
  /** 2 端子素子の両端ノード (P(...) を組み立てるのに要る)。無ければ null */
  terminals(blockId: string): { a: string; b: string } | null
}

export type ParseResult = { expr: TraceExpr } | { error: string }

interface Token {
  readonly kind: 'name' | 'number' | 'op' | 'paren' | 'comma'
  readonly text: string
}

const tokenize = (src: string): Token[] | string => {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (/[0-9.]/.test(ch)) {
      const m = /^[0-9]*\.?[0-9]+(e[-+]?[0-9]+)?/i.exec(src.slice(i))
      if (!m) return `数値として読めません: ${src.slice(i)}`
      tokens.push({ kind: 'number', text: m[0] })
      i += m[0].length
      continue
    }
    // 名前はノード ID (H:2,3) や blockId (blk-4) を含むので記号を広めに許す
    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_:\-.]*/.exec(src.slice(i))!
      tokens.push({ kind: 'name', text: m[0] })
      i += m[0].length
      continue
    }
    if ('+-*/'.includes(ch)) {
      tokens.push({ kind: 'op', text: ch })
      i++
      continue
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ kind: 'paren', text: ch })
      i++
      continue
    }
    if (ch === ',') {
      tokens.push({ kind: 'comma', text: ch })
      i++
      continue
    }
    return `使えない文字です: ${ch}`
  }
  return tokens
}

class ParseError extends Error {}

/** 式を組み立てる。失敗は例外で投げ、`parseExpr` が文字列に直す */
const build = (tokens: readonly Token[], symbols: ExprSymbols): TraceExpr => {
  let pos = 0
  const peek = (): Token | undefined => tokens[pos]
  const eat = (text: string): void => {
    if (peek()?.text !== text) throw new ParseError(`${text} が必要です`)
    pos++
  }

  const args = (): string[] => {
    eat('(')
    const out: string[] = []
    for (;;) {
      const t = peek()
      if (!t || t.kind === 'paren') break
      if (t.kind === 'comma') {
        pos++
        continue
      }
      if (t.kind !== 'name' && t.kind !== 'number') {
        throw new ParseError(`名前が必要です: ${t.text}`)
      }
      out.push(t.text)
      pos++
    }
    eat(')')
    return out
  }

  const quantity = (fn: string): TraceExpr => {
    const names = args()
    const lower = fn.toLowerCase()
    if (lower === 'v') {
      const nodes = names.map((n) => {
        const id = symbols.node(n)
        if (!id) throw new ParseError(`ノードが見つかりません: ${n}`)
        return id
      })
      if (nodes.length === 1) return { kind: 'v', node: nodes[0] }
      if (nodes.length === 2) return { kind: 'vdiff', a: nodes[0], b: nodes[1] }
      throw new ParseError('V() はノード 1 つか 2 つです')
    }
    if (names.length !== 1) throw new ParseError(`${fn}() は素子 1 つです`)
    const block = symbols.block(names[0])
    if (!block) throw new ParseError(`素子が見つかりません: ${names[0]}`)
    if (lower === 'i') return { kind: 'i', block }
    const t = symbols.terminals(block)
    if (!t) throw new ParseError(`両端が決まらないので電力は出せません: ${names[0]}`)
    return { kind: 'p', block, a: t.a, b: t.b }
  }

  const expr = (): TraceExpr => {
    let left = term()
    for (;;) {
      const t = peek()
      if (t?.kind !== 'op' || (t.text !== '+' && t.text !== '-')) return left
      pos++
      left = { kind: 'bin', op: t.text as '+' | '-', left, right: term() }
    }
  }

  const term = (): TraceExpr => {
    let left = unary()
    for (;;) {
      const t = peek()
      if (t?.kind !== 'op' || (t.text !== '*' && t.text !== '/')) return left
      pos++
      left = { kind: 'bin', op: t.text as '*' | '/', left, right: unary() }
    }
  }

  const unary = (): TraceExpr => {
    const t = peek()
    if (t?.kind === 'op' && t.text === '-') {
      pos++
      return { kind: 'bin', op: '*', left: { kind: 'const', value: -1 }, right: unary() }
    }
    return primary()
  }

  const primary = (): TraceExpr => {
    const t = peek()
    if (!t) throw new ParseError('式が途中で終わっています')
    if (t.kind === 'number') {
      pos++
      return { kind: 'const', value: Number(t.text) }
    }
    if (t.kind === 'paren' && t.text === '(') {
      pos++
      const inner = expr()
      eat(')')
      return inner
    }
    if (t.kind === 'name') {
      const fn = t.text.toLowerCase()
      pos++
      if (['v', 'i', 'p'].includes(fn)) return quantity(t.text)
      if (['abs', 'sqrt', 'd'].includes(fn)) {
        eat('(')
        const arg = expr()
        eat(')')
        return { kind: 'fn', fn: fn as 'abs' | 'sqrt' | 'd', arg }
      }
      throw new ParseError(`知らない関数です: ${t.text}`)
    }
    throw new ParseError(`ここには書けません: ${t.text}`)
  }

  const out = expr()
  if (pos !== tokens.length) throw new ParseError(`余分な入力があります: ${tokens[pos].text}`)
  return out
}

/** 式文字列 → {@link TraceExpr}。失敗はユーザに出せる日本語メッセージで返す */
export const parseExpr = (text: string, symbols: ExprSymbols): ParseResult => {
  const tokens = tokenize(text)
  if (typeof tokens === 'string') return { error: tokens }
  if (tokens.length === 0) return { error: '式が空です' }
  try {
    return { expr: build(tokens, symbols) }
  } catch (e) {
    return { error: e instanceof ParseError ? e.message : String(e) }
  }
}
