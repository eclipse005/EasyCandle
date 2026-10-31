# EasyCandle × FX Replay UI 1:1

截至 2026-10-31。FX Replay 截图在 `/workspace/fxr-ui/`；EasyCandle 库存见 `ui-easycandle-inventory.md`。

## 结论

要对标的是「终端感」：近黑画布、品牌蓝只打在主操作上、左绘图轨 / 顶工具条 / 右订单票 / 底成交表、底中浮动回放、票上风险筹码先于订单类型、图上入场·止损·止盈标签。EasyCandle 会话骨架已接近；差距在色板（琥珀/锌 vs 蓝/近黑）、仪表盘产品化、票字段序、图角一键买卖。

免费套餐拦了「新建会话」向导；向导字段用既有会话 create 记忆，不挡布局对标。

## 布局对照

| 区域 | FX Replay v2 | EasyCandle | 1:1 差距 |
|---|---|---|---|
| 壳 | 左栏导航 + 顶栏 + 主列 | 管理台顶 Tab；会话内顶工具条 | 管理台产品化 |
| 会话图 | 左轨·顶条·图·右票·底表 | 同骨架，票宽 260 | 收紧；票约 300 |
| 回放 | 底中浮动 + TF 芯片 + go-to | FloatingReplayBar | 补 scrub；强化 TF |
| 一键买卖 | 图底左 Buy蓝/Sell红 | 无 | **高优** |
| 权益 | 图底右 | 票/会话卡 | 搬到图底右 |
| 日记 | 右轨 Journal | 成交备注 | 中优轻抽屉 |

## 色板

| Token | FX Replay |
|---|---|
| 页面 | `#030303` |
| 卡片 | `#131415` |
| 描边 | `#414347` |
| 主蓝 | `#0260FD` |
| 涨/买 | `#06A77D` |
| 跌/卖 | `#ED6A5A` |

品牌字标可留琥珀；交互主色改蓝。

## 票字段序（FXR）

1. Sell | Buy  
2. Initial / Current balance  
3. 风险筹码 0.5%–5%  
4. Est. loss / profit / R:R  
5. Market | Limit | Stop  
6. 数量 + 入场价  
7. SL / TP  
8. Place order（全宽蓝）

## Top 15 必做

1. 近黑画布 + 卡片 + 描边  
2. 主色品牌蓝  
3. 涨绿跌红统一  
4. 会话壳间距与票宽  
5. 底中回放条视觉 + scrub  
6. 票字段序与分段控件  
7. 图上入场/SL/TP 标签强化  
8. Blotter Open / Pending / Closed  
9. 图底左一键买卖 + 图底右权益  
10. 会话卡 Resume 主按钮  
11. 快捷键两列面板  
12. 字号密度 12 / 14 / 大号指标  
13. 管理台大标题与启动卡  
14. 轻 Journal 抽屉  
15. **不做** Upgrade 付费墙（产品定位）

## 实施顺序

- **P0** 主题与会话壳（色板、图底买卖/权益、回放条）  
- **P1** 下单票重排  
- **P2** 仪表盘产品化  
- **P3** 快捷键面板 + 轻 Journal  

## 刻意不做

付费墙、Prop firm、Order flow、云同步、付费新闻日历。新建向导可仿 UI，数据仍本地 CSV。

## P0 shipped (2026-10-31)

- [x] Theme tokens: page `#030303`, card `#131415`, border `#414347`, primary `#0260FD`, up `#06A77D`, down `#ED6A5A` (`main.css` + `primary` Tailwind scale + `UI_TOKENS` / chart palette)
- [x] Interactive chrome accent → primary blue (IconButton `tone="accent"`, play control); wordmark amber kept
- [x] Session shell: order ticket `300px`; chart/ticket/blotter hairline `border-zinc-700`
- [x] Chart overlays: bottom-left instant Buy (blue) / Sell (red) + qty → `paperBuy`/`paperSell`; bottom-right equity + session PnL
- [x] Floating replay bar: dark card pill (`rounded-2xl`), blue circular play; scrubber deferred
- [x] Blotter tab labels: Open positions / Pending orders / Closed positions (Order History retained)
- [ ] Ticket field reorder (Sell|Buy → risk chips → type) — **P1**
- [ ] Chart entry/SL/TP label polish — **P1**
- [ ] Dashboard productization — **P2**
