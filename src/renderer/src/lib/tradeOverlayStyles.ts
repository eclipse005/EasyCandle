/** Chart overlay tokens for open-position / TP / SL chrome (FX Replay–aligned). */
export const TRADE_OVERLAY = {
  longLine: '#0260FD',
  shortLine: '#ED6A5A',
  handleFill: '#131415',
  handleTextMuted: '#9CA3AF',
  pnlProfit: '#06A77D',
  pnlLoss: '#ED6A5A',
  tpLine: '#06A77D',
  slLine: '#FF9800',
  qtyFill: '#0260FD',
  qtyText: '#FFFFFF',
  closeIcon: '#9EC1FF',
  connector: '#0260FD',
  zoneTp: 'rgba(6, 167, 125, 0.10)',
  zoneSl: 'rgba(255, 152, 0, 0.10)',
  /** Active entry uses a solid stroke; pending TP/SL stay dotted. */
  entryDash: undefined as string | undefined,
  levelDash: '3 3',
  entryWidth: 1.5,
  levelWidth: 1.25,
  connectorDash: '4 4',
  /** Closed trade history entry→exit arrow (MT-style dashed). */
  historyDash: '5 3',
  historyWidth: 1.75,
  font: 'system-ui, Segoe UI, Tahoma, sans-serif'
} as const

export const OVERLAY_LAYOUT = {
  pillH: 22,
  placeW: 30,
  placeH: 18,
  qtyW: 22,
  closeW: 22,
  gap: 5,
  radius: 3,
  /** Approx width of the PNL text section before measuring. */
  pnlMinW: 88,
  rightPad: 10,
  connectorR: 3.5
} as const
