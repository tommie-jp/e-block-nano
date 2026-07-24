/**
 * 自前ビルドの libngspice(shared mode)WASM グルー(`libngspice.mjs`)の型宣言。
 * Emscripten MODULARIZE + EXPORT_ES6 の default export は Module 生成関数。
 * ここで使う shared API とランタイムヘルパだけを最小宣言する。
 */

export interface NgspiceModule {
  /** C 関数呼び出し。ret/argTypes は Emscripten 表記('number'|'string'|null) */
  ccall(
    name: string,
    returnType: 'number' | 'string' | null,
    argTypes: readonly ('number' | 'string')[],
    args: readonly unknown[],
  ): unknown
  /** JS 関数を C 関数ポインタ化(sig 例 'iiiii')。ALLOW_TABLE_GROWTH 前提 */
  addFunction(fn: (...args: number[]) => number, signature: string): number
  removeFunction(ptr: number): void
  UTF8ToString(ptr: number): string
  /** WASM ヒープ読み(type 例 'i32'|'double') */
  getValue(ptr: number, type: string): number
  setValue(ptr: number, value: number, type: string): void
}

export interface NgspiceModuleOptions {
  /** wasm ファイルの場所解決(Vite の ?url を返す) */
  locateFile?: (path: string) => string
}

declare const createNgspiceModule: (
  options?: NgspiceModuleOptions,
) => Promise<NgspiceModule>

export default createNgspiceModule
