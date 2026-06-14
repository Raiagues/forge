// ──────────────────────────────────────────────────────────────────
// WebLLM — the FREE, key-less LLM provider for the AI tutor. The model
// runs ENTIRELY in the browser via WebGPU (no API, no server, no secret,
// no cost), so it is safe on GitHub and works offline once the weights
// are cached. Heavy, so it is OPT-IN and lazy-loaded: the @mlc-ai/web-llm
// bundle and the model download only happen after the user enables it.
//
// Stays out of assistant.js (the pure seeded engine) so that module has
// no heavy dependency; the seeded library remains the instant default.
// ──────────────────────────────────────────────────────────────────

import { TUTOR_SYSTEM_PROMPT } from './assistant.js'

// Small instruct model (~700 MB, q4f16), multilingual incl. pt-BR. Swap to
// 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC' for better answers at a bigger
// download, or 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' for a lighter one.
export const TUTOR_MODEL = 'Llama-3.2-1B-Instruct-q4f16_1-MLC'

export function isWebGPUAvailable() {
  return typeof navigator !== 'undefined' && !!navigator.gpu
}

let enginePromise = null

// Lazily create (and cache) the in-browser engine. onProgress receives
// MLC's { progress: 0..1, text } during the one-time model download.
export function initWebLLM(onProgress) {
  if (!isWebGPUAvailable()) return Promise.reject(new Error('WebGPU indisponível neste navegador'))
  if (!enginePromise) {
    enginePromise = (async () => {
      const webllm = await import('@mlc-ai/web-llm')
      return webllm.CreateMLCEngine(TUTOR_MODEL, {
        initProgressCallback: (r) => onProgress?.(r),
      })
    })().catch((err) => { enginePromise = null; throw err })
  }
  return enginePromise
}

// Stream an answer from the local model. `history` is the prior turns
// ([{ role:'user'|'assistant', content }]); onToken(delta) fires per chunk.
export async function streamWebLLM(history, { onToken, onProgress } = {}) {
  const engine = await initWebLLM(onProgress)
  const messages = [{ role: 'system', content: TUTOR_SYSTEM_PROMPT }, ...history]
  const chunks = await engine.chat.completions.create({
    messages, stream: true, temperature: 0.4, max_tokens: 700,
  })
  let full = ''
  for await (const chunk of chunks) {
    const delta = chunk.choices?.[0]?.delta?.content || ''
    if (delta) { full += delta; onToken?.(delta) }
  }
  return full.trim()
}
