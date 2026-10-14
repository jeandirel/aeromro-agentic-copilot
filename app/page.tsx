'use client'

import { useState } from 'react'
import { Activity, AlertTriangle, BarChart3, Bot, CheckCircle2, ChevronRight, CircleHelp, ClipboardCheck, Database, Gauge, History, LayoutDashboard, Menu, Search, Send, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Wrench, X } from 'lucide-react'

const fleets = [
  { id: 'FD001', name: 'Single condition / single fault', total: 100, nominal: 74, plan: 18, inspect: 8, mean: 84, trend: '+4.1%' },
  { id: 'FD002', name: 'Six conditions / single fault', total: 259, nominal: 203, plan: 39, inspect: 17, mean: 71, trend: '-2.8%' },
  { id: 'FD003', name: 'Single condition / two faults', total: 100, nominal: 68, plan: 21, inspect: 11, mean: 63, trend: '-6.4%' },
  { id: 'FD004', name: 'Six conditions / two faults', total: 248, nominal: 181, plan: 45, inspect: 22, mean: 58, trend: '-9.2%' },
]
const distribution = [6, 9, 14, 18, 26, 31, 40, 48, 57, 64, 72, 78, 84, 89, 83, 75, 64, 55, 44, 37, 29, 23, 17, 12, 8, 5]
const navItems = [
  ['Fleet overview', LayoutDashboard], ['Engine health', Gauge], ['Predictive analysis', BarChart3], ['AI copilot', Bot], ['Recommendations', ClipboardCheck], ['Audit trail', History],
] as const

export default function Home() {
  const [active, setActive] = useState('Fleet overview')
  const [fleet, setFleet] = useState('All fleets')
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const filtered = fleet === 'All fleets' ? fleets : fleets.filter((item) => item.id === fleet)
  const total = filtered.reduce((sum, item) => sum + item.total, 0)
  const inspect = filtered.reduce((sum, item) => sum + item.inspect, 0)
  const plan = filtered.reduce((sum, item) => sum + item.plan, 0)

  function ask() {
    if (!query.trim()) return
    setAnswer('The connected assessment identifies FD004 / Engine 81 as the highest-priority review. Its 12-cycle estimate has an 80% interval of 8–24 cycles. This is decision support only; a certified engineer must review evidence before any work order or operational action.')
    setQuery('')
  }

  return <div className="app">
    <aside className={`rail ${mobileNav ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark">A</div><div><strong>AeroMRO</strong><small>AGENTIC COPILOT</small></div><button className="close-nav" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18} /></button></div>
      <div className="workspace-label">Workspace <span>LIVE</span></div>
      <nav className="nav" aria-label="Primary navigation">{navItems.map(([label, Icon]) => <button key={label} className={active === label ? 'active' : ''} onClick={() => { setActive(label); setMobileNav(false) }}><Icon size={16} /><span>{label}</span>{label === 'AI copilot' && <em>Preview</em>}</button>)}</nav>
      <div className="rail-bottom"><div className="boundary"><Database size={14} /><span><b>Data boundary</b><br />NASA C-MAPSS · simulated</span></div><div className="approval"><ShieldCheck size={14} /> Human approval required</div></div>
    </aside>
    <main className="main">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="crumb">Operations <ChevronRight size={13} /> <b>{active}</b></div><div className="top-actions"><div className="status"><i /> API connected</div><button className="icon-button" aria-label="Settings"><Settings2 size={17} /></button><div className="avatar">JD</div></div></header>
      <div className="content">
        <div className="heading"><div><div className="eyebrow teal">FLEET INTELLIGENCE / 14 OCT 2026 / 09:14 UTC</div><h1>{active}</h1><p>{active === 'Fleet overview' ? 'Prioritise maintenance attention across the active engine fleet.' : 'This workspace is connected to the AeroMRO assessment service.'}</p></div><div className="heading-actions"><button className="secondary-button"><SlidersHorizontal size={15} /> Configure view</button><select className="selector" value={fleet} onChange={(event) => setFleet(event.target.value)} aria-label="Select fleet"><option>All fleets</option>{fleets.map((item) => <option key={item.id}>{item.id}</option>)}</select></div></div>
        <div className="signal-strip"><div><span className="signal-dot" /> Assessment service healthy</div><span className="divider" /><div>Last refresh <b>2 min ago</b></div><span className="divider" /><div>Model <b>RUL v0.4</b></div><div className="strip-right"><CircleHelp size={14} /> Data dictionary</div></div>
        <section className="metrics" aria-label="Fleet metrics"><Metric label="Engines monitored" value={total} foot="across 4 simulated fleets" /><Metric label="Mean RUL" value="68 cycles" foot="−6.2% vs previous review" /><Metric label="Inspect now" value={inspect} foot="before next flight" type="alert" /><Metric label="Plan inspection" value={plan} foot="next maintenance opportunity" type="warn" /></section>
        <div className="grid top-grid"><section className="panel fleet-panel"><PanelHead title="Fleet readiness" sub="Status distribution by benchmark subset" action="View engine list" /><div className="legend"><span><i className="key green" /> Nominal</span><span><i className="key amber" /> Plan</span><span><i className="key red" /> Inspect</span></div><div className="table-wrap"><table className="fleet-table"><thead><tr><th>Fleet / condition</th><th>Engines</th><th>Mean RUL</th><th>Attention</th><th>Readiness</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><span className="fleet-id">{item.id}</span><span className="fleet-name">{item.name}</span></td><td className="mono">{item.total}</td><td><span className="mono strong">{item.mean}</span> <span className="unit">cycles</span><small className={`trend ${item.trend.startsWith('+') ? 'up' : 'down'}`}>{item.trend}</small></td><td><span className="pill red">{item.inspect} inspect</span> <span className="pill amber">{item.plan} plan</span></td><td><div className="readiness"><div className="progress"><i style={{ width: `${Math.round(item.nominal / item.total * 100)}%` }} /></div><span>{Math.round(item.nominal / item.total * 100)}%</span></div></td></tr>)}</tbody></table></div></section>
          <section className="panel rul-panel"><PanelHead title="RUL distribution" sub="All engines · latest assessment" action="" icon={<Activity size={16} />} /><div className="chart-meta"><span><b>68</b> median cycles</span><span className="chart-note"><i className="key red" /> Critical &lt; 20</span><span className="chart-note"><i className="key amber" /> Planning 20–50</span></div><div className="chart"><div className="threshold critical" /><div className="threshold planning" />{distribution.map((height, index) => <div key={index} className={`chart-bar ${index < 5 ? 'critical-bar' : index < 13 ? 'planning-bar' : ''}`} style={{ height: `${height}%` }} title={`${height} engines`} />)}</div><div className="chart-axis"><span>0</span><span>20</span><span>50</span><span>80</span><span>100+ cycles</span></div><div className="notice"><AlertTriangle size={14} /> <span><b>39 engines</b> fall below the planning threshold. Review evidence before raising a work order.</span></div></section></div>
        <div className="grid bottom-grid"><section className="panel queue-panel"><PanelHead title="Attention queue" sub="Sorted by urgency and uncertainty" action="Open queue" /><div className="queue-summary"><div><b>47</b><span>open reviews</span></div><div><b>12</b><span>high uncertainty</span></div><div><b>08:42</b><span>last event</span></div></div><div className="timeline"><Event icon={<AlertTriangle size={13} />} title="FD004 / Engine 81" text="12 cycles remaining · 80% interval [8, 24]" tag="INSPECT NOW" tone="red" /><Event icon={<Wrench size={13} />} title="FD002 / Engine 14" text="27 cycles remaining · recommendation requires review" tag="PLAN" tone="amber" /><Event icon={<CheckCircle2 size={13} />} title="FD001 / Engine 31" text="Health assessment refreshed from telemetry" tag="UPDATED" tone="green" /></div></section>
          <section className="copilot"><div className="copilot-top"><div><div className="panel-title">AI copilot</div><div className="panel-sub">Evidence-led maintenance support</div></div><div className="copilot-badge"><Sparkles size={13} /> PREVIEW</div></div><div className="evidence-callout"><ShieldCheck size={15} /><div><b>Human validation is required</b><span>Responses cite available assessment data and never authorise operational action.</span></div></div>{answer ? <div className="chat-line"><small>COPILOT · ASSESSMENT CONTEXT</small>{answer}</div> : <div className="chat-line"><small>READY TO ASSIST</small>Ask about an engine, RUL, or the inspection queue. The response will show evidence, confidence and review requirements.</div>}<div className="ask"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) ask() }} placeholder="Ask about an engine assessment" aria-label="Ask the AI copilot" /><button onClick={ask} aria-label="Send question"><Send size={14} /></button></div></section></div>
        <p className="footer-note"><ShieldCheck size={13} /> Decision support only · NASA C-MAPSS is experimental simulated data, not operational aircraft telemetry. AeroMRO does not authorise flight or grounding decisions.</p>
      </div>
    </main>
  </div>
}

function PanelHead({ title, sub, action, icon }: { title: string; sub: string; action?: string; icon?: React.ReactNode }) { return <div className="panel-head"><div><div className="panel-title">{title}</div><div className="panel-sub">{sub}</div></div>{action ? <button className="link">{action} <ChevronRight size={12} /></button> : icon}</div> }
function Metric({ label, value, foot, type = '' }: { label: string; value: string | number; foot: string; type?: string }) { return <div className={`metric ${type}`}><div className="metric-label">{label}<span>↗</span></div><div className="metric-value">{value}</div><div className="metric-foot">{foot}</div></div> }
function Event({ icon, title, text, tag, tone }: { icon: React.ReactNode; title: string; text: string; tag: string; tone: string }) { return <div className="event"><div className={`event-icon ${tone}`}>{icon}</div><div className="event-copy"><b>{title}</b><p>{text}</p></div><span className={`event-tag ${tone}`}>{tag}</span></div> }
