// Deterministic cosmetic helpers — hosts, gifts, recharge packages etc. are now
// fetched live from the backend (see src/lib/api.js). This file only keeps the
// gradient palette used to render an avatar/media placeholder for any id.

const PALETTE = [
  ['#8fb0e8', '#e79bb0'],
  ['#e6b980', '#8a63d2'],
  ['#e8c07a', '#7f9bd6'],
  ['#e8b06a', '#d98a8a'],
  ['#7fd6a8', '#6a63d6'],
  ['#c98fd6', '#e79b9b'],
  ['#c98f9f', '#8f8fd6'],
  ['#8f8fe8', '#b0c9e8'],
  ['#e79b9b', '#8fb0e8'],
  ['#e79bb0', '#8fb0e8'],
  ['#8fd6c0', '#5b28d6'],
  ['#d6b88f', '#5b3fd0'],
]

function hash(str) {
  let h = 0
  const s = String(str || '')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function gradientFor(id) {
  return PALETTE[hash(id) % PALETTE.length]
}
