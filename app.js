/* AeroMRO UI. All operational values come from the existing FastAPI backend. */
"use strict";

const API = "/api/proxy";
const state = {
  fleets: [], health: null, enginesByFleet: {}, fleet: null, unit: null,
  detail: null, view: "overview", loading: false, loadedAt: null, audit: [], thresholdsByFleet: {}, failedFleets: [],
};
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v, digits = 0) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v).toLocaleString("fr-FR", { maximumFractionDigits: digits }) : "—";
const statusText = { inspect_now: "Inspection prioritaire", plan_inspection: "À planifier", healthy: "Surveillance normale", allow: "Recommandation permise", require_approval: "Validation humaine", deny: "Refusé" };
const tag = (s) => '<span class="status ' + esc(s) + '">' + esc(statusText[s] || s || "Inconnu") + "</span>";
const activeFleet = () => state.fleets.find((f) => f.subset === state.fleet);
const activeEngines = () => state.enginesByFleet[state.fleet] || [];

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(API + "?path=" + encodeURIComponent(path), {
      method: options.method || "GET",
      headers: options.body ? { "Content-Type": "application/json" } : {},
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(28000),
    });
  } catch (cause) {
    if (cause?.name === "TimeoutError" || cause?.name === "AbortError") throw new Error("Le service a dépassé le délai de 28 secondes.");
    throw new Error("Connexion API interrompue. Réessayez après vérification du réseau.");
  }
  let data;
  try { data = await response.json(); } catch { throw new Error("Réponse invalide du serveur (" + response.status + ")"); }
  if (!response.ok) {
    const reason = typeof data?.detail === "string" ? data.detail : (data?.error || "Erreur HTTP " + response.status);
    if (response.status === 401) throw new Error("Accès refusé par l’API. Vérifiez le code d’accès côté Vercel (AEROMRO_DEMO_ACCESS_CODE).");
    throw new Error(String(reason));
  }
  return data;
}
function error(message) { $("globalError").textContent = message; $("globalError").hidden = false; }
function clearError() { $("globalError").hidden = true; $("globalError").textContent = ""; }
function connection(ok) {
  const el = $("connectionBadge");
  el.className = "connection " + (ok ? "online" : "offline");
  el.innerHTML = "<i></i>" + (ok ? "API opérationnelle" : "API indisponible");
}
function toggleLoading(on) { state.loading = on; $("refreshButton").disabled = on; $("refreshButton").classList.toggle("loading-spin", on); }

async function init(refresh = false) {
  if (state.loading) return;
  toggleLoading(true);
  clearError();
  const preservedFleet=state.fleet, preservedUnit=state.unit;
  // Fail closed for operational values: on a failed refresh, do not present stale
  // RUL or a formerly selected engine as if it came from the current API call.
  state.fleets=[]; state.health=null; state.enginesByFleet={};
  state.thresholdsByFleet={}; state.failedFleets=[];
  state.unit=null; state.detail=null; state.fleet=null; state.loadedAt=null;
  try {
    const [health, fleets] = await Promise.all([api("/health"), api("/fleets")]);
    if (!Array.isArray(fleets)) throw new Error("Structure des flottes inattendue.");
    state.fleets = fleets;
    state.health = health;
    // Never retain data from a previous successful refresh if this refresh is partial.
    state.enginesByFleet = {};
    state.thresholdsByFleet = {};
    state.failedFleets = [];
    connection(true);
    const wanted = refresh && preservedFleet ? preservedFleet : fleets[0]?.subset;
    if (!wanted) {
      state.fleet = null; state.unit = null; state.detail = null;
      state.enginesByFleet = {};
    } else {
      await loadFleet(wanted, { fresh: true, keepUnit: refresh, preserveUnit: preservedUnit, quiet: true });
      // Load all available fleets for genuinely fleet-wide inspection priorities.
      // A failed secondary fleet never replaces its data with invented values.
      const otherFleets = fleets.map((f) => f.subset).filter((id) => id !== wanted && /^FD00[1-4]$/.test(id));
      const outcomes = await Promise.allSettled(otherFleets.map(async (id) => {
        const payload = await api("/fleets/" + id + "/engines");
        if (!Array.isArray(payload?.engines)) throw new Error("Invalid engine list for " + id);
        state.enginesByFleet[id] = payload.engines.filter((e) => Number.isSafeInteger(Number(e.unit)) && Number(e.unit) > 0 && e.rul !== null && e.rul !== undefined && e.rul !== "" && Number.isFinite(Number(e.rul)));
        state.thresholdsByFleet[id] = payload.thresholds || {};
      }));
      state.failedFleets = otherFleets.filter((id,index)=>outcomes[index].status==="rejected");
      if (state.failedFleets.length) error("Couverture incomplète : " + state.failedFleets.join(", ") + " non chargée(s). Les priorités affichées ne concernent que les flottes récupérées.");
    }
    state.loadedAt = new Date();
    $("lastUpdated").textContent = "Mis à jour à " + state.loadedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    render();
  } catch (e) {
    connection(false);
    error("Impossible de charger les données de l’API : " + e.message + ". Aucune donnée fictive n’est affichée.");
    render();
  } finally { toggleLoading(false); }
}
async function loadFleet(subset, opts = {}) {
  if (!/^FD00[1-4]$/.test(subset)) return;
  const previousUnit = opts.preserveUnit ?? state.unit;
  state.fleet = subset;
  if (!state.enginesByFleet[subset] || opts.fresh) {
    const response = await api("/fleets/" + subset + "/engines");
    if (!Array.isArray(response?.engines)) throw new Error("Liste des moteurs invalide.");
    state.enginesByFleet[subset] = response.engines.filter((e) => Number.isSafeInteger(Number(e.unit)) && Number(e.unit) > 0 && e.rul !== null && e.rul !== undefined && e.rul !== "" && Number.isFinite(Number(e.rul)));
    state.thresholdsByFleet[subset] = response.thresholds || {};
  }
  const engines = activeEngines();
  const order={inspect_now:0,plan_inspection:1,healthy:2};
  const firstRisk=[...engines].sort((a,b)=>(order[a.status]??3)-(order[b.status]??3) || Number(a.rul)-Number(b.rul))[0];
  const chosen = opts.keepUnit && engines.some((e) => Number(e.unit) === Number(previousUnit)) ? previousUnit : firstRisk?.unit ?? null;
  if (chosen == null) { state.unit = null; state.detail = null; }
  else await loadEngine(chosen, { quiet: true });
  if (!opts.quiet) render();
}
async function loadEngine(unit, opts = {}) {
  const id = Number(unit);
  if (!activeEngines().some((e) => Number(e.unit) === id)) return;
  state.unit = id;
  state.detail = null;
  if (!opts.quiet) render();
  const requestedFleet = state.fleet;
  try {
    const result = await api("/fleets/" + requestedFleet + "/engines/" + id + "?history=60");
    if (state.unit === id && state.fleet === requestedFleet) state.detail = result;
    clearError();
  } catch (e) {
    error("Impossible de lire l’historique du moteur " + id + " : " + e.message);
  }
  if (!opts.quiet) render();
}
function selectedAssessment() {
  return state.detail?.engine || activeEngines().find((e) => Number(e.unit) === Number(state.unit)) || null;
}
function totals() {
  return state.fleets.reduce((acc, f) => {
    acc.engines += Number(f.engines) || 0;
    acc.critical += Number(f.status_counts?.inspect_now) || 0;
    acc.planned += Number(f.status_counts?.plan_inspection) || 0;
    acc.healthy += Number(f.status_counts?.healthy) || 0;
    return acc;
  }, { engines: 0, critical: 0, planned: 0, healthy: 0 });
}
function metrics() {
  const t = totals();
  const cards = [
    { label: "Moteurs analysés", value: state.fleets.length ? num(t.engines) : "—", note: "Ensemble des flottes disponibles", icon: "↗", kind: "" },
    { label: "Inspections prioritaires", value: state.fleets.length ? num(t.critical) : "—", note: "Selon le seuil d’inspection de l’API", icon: "!", kind: "danger" },
    { label: "Inspections à planifier", value: state.fleets.length ? num(t.planned) : "—", note: "Selon les seuils de l’API", icon: "◷", kind: "caution" },
    { label: "Flottes disponibles", value: state.fleets.length ? num(state.fleets.length) : "—", note: "Moteurs simulés C-MAPSS", icon: "▦", kind: "safe" },
  ];
  $("metrics").innerHTML = cards.map((c) => '<article class="metric ' + c.kind + '"><div class="metric-top"><span>' + c.label + '</span><i>' + c.icon + '</i></div><strong>' + c.value + '</strong><small>' + c.note + "</small></article>").join("");
}
function fleetDistribution() {
  if (!state.fleets.length) { $("overviewFleets").innerHTML = '<p class="empty">Aucune flotte déployée sur l’API.</p>'; return; }
  const html = state.fleets.map((f) => {
    const total = Math.max(1, Number(f.engines) || 0);
    const c = Number(f.status_counts?.inspect_now) || 0;
    const p = Number(f.status_counts?.plan_inspection) || 0;
    const g = Number(f.status_counts?.healthy) || 0;
    return '<div class="fleet-progress"><div class="fleet-progress-head"><strong>' + esc(f.subset) + '</strong><span>' + num(f.engines) + ' moteurs · ' + num(c) + ' prioritaires</span></div><div class="stack-bar" role="img" aria-label="' + esc(f.subset) + " : " + c + " prioritaires, " + p + " à planifier, " + g + ' normaux"><span class="segment-critical" style="width:' + (c / total * 100) + '%"></span><span class="segment-plan" style="width:' + (p / total * 100) + '%"></span><span class="segment-good" style="width:' + (g / total * 100) + '%"></span></div></div>';
  }).join("");
  $("overviewFleets").innerHTML = html + '<div class="distribution-legend"><span><i class="segment-critical"></i> Inspection prioritaire</span><span><i class="segment-plan"></i> À planifier</span><span><i class="segment-good"></i> Normal</span></div>';
}
function priorities() {
  const order = {inspect_now:0,plan_inspection:1,healthy:2};
  const engines=Object.values(state.enginesByFleet).flat()
    .filter((e)=>e.rul !== null && e.rul !== undefined && e.rul !== "" && Number.isFinite(Number(e.rul)))
    .sort((a,b)=>(order[a.status]??3)-(order[b.status]??3) || Number(a.rul)-Number(b.rul))
    .slice(0,8);
  $("priorityRows").innerHTML=(state.failedFleets.length ? '<p class="coverage-alert" role="status">Couverture partielle : '+esc(state.failedFleets.join(", "))+'. Priorités limitées aux données reçues.</p>' : "")+(engines.length?engines.map((e)=>
    '<button class="priority-row queue-entry '+esc(e.status)+'" data-priority-fleet="'+esc(e.subset)+'" data-unit="'+e.unit+'" data-jump="fleet" aria-label="Examiner '+esc(e.subset)+' moteur '+e.unit+'">'
    +'<span class="queue-identity"><span class="queue-state" aria-hidden="true"></span><span><strong>'+esc(e.subset)+' / ENG–'+esc(e.unit)+'</strong><small>'+esc(statusText[e.status]||e.status)+' · '+num(e.cycles_flown)+' cycles parcourus</small></span></span>'
    +'<span class="queue-range">'+num(e.rul_low,1)+' – '+num(e.rul_high,1)+'<small>cycles · intervalle 80 %</small></span>'
    +'<span class="queue-remaining"><strong>'+num(e.rul,1)+'</strong><small>cycles ↗</small></span></button>').join("")
    :'<p class="empty">Les listes moteurs sont indisponibles. Aucune valeur n’est simulée côté interface.</p>');
}
function controlRoom() {
  const t=totals();
  $("ribbonCritical").textContent=state.fleets.length ? num(t.critical) : "—";
  $("ribbonPlan").textContent=state.fleets.length ? num(t.planned) : "—";
  $("ribbonActive").textContent=state.unit!=null ? (state.fleet+" / ENG–"+state.unit) : "Aucun moteur";
  $("ribbonSync").textContent=state.loadedAt ? state.loadedAt.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})+" · "+Object.keys(state.enginesByFleet).length+"/"+state.fleets.length+" flottes" : "En attente API";
  const e=selectedAssessment();
  if (!e) {
    $("commandFocus").innerHTML='<p class="empty">Aucune évaluation moteur disponible. Connectez l’API ou sélectionnez une flotte.</p>';
    return;
  }
  const status=e.status==="inspect_now"?"Évaluation prioritaire":e.status==="plan_inspection"?"Inspection à planifier":"Surveillance normale";
  const confidence=e.confidence==null?"—":num(Number(e.confidence)*100,1)+" %";
  $("commandFocus").innerHTML=
    '<div class="focus-context"><span>'+esc(e.subset)+' / ENG–'+esc(e.unit)+'</span>'+tag(e.status)+'</div>'
    +'<div class="focus-reading"><div><span>RUL ESTIMÉ</span><strong>'+num(e.rul,1)+'</strong><small>cycles restants</small></div><p>'+esc(status)+'</p></div>'
    +'<div class="focus-facts"><div><span>Intervalle 80 %</span><strong>'+num(e.rul_low,1)+' – '+num(e.rul_high,1)+'</strong></div><div><span>Cycles parcourus</span><strong>'+num(e.cycles_flown)+'</strong></div><div><span>Confiance statut</span><strong>'+confidence+'</strong></div></div>'
    +'<div class="focus-actions"><button class="btn btn-outline" data-jump="fleet">Voir le diagnostic ↗</button><button class="btn btn-primary" data-copilot-intent="risk">Analyser avec l’IA ↗</button></div>'
    +'<p class="focus-disclosure">Lecture du modèle sur données simulées. Une recommandation IA ne déclenche aucun ordre de maintenance.</p>';
}
function chart(history, key, label) {
  if (!/^[a-z][a-z0-9_]*$/i.test(key)) return '<p class="empty">Courbe indisponible.</p>';
  const data = (history || []).filter((h) => h[key] !== null && h[key] !== undefined && h[key] !== "" && Number.isFinite(Number(h[key])));
  if (data.length < 2) return '<p class="empty">Historique insuffisant pour dessiner une courbe.</p>';
  const W=720,H=230,left=48,right=15,top=15,bottom=33, w=W-left-right,h=H-top-bottom;
  const values=data.map((d)=>Number(d[key]));
  const lo=Math.min(...values),hi=Math.max(...values),pad=Math.max((hi-lo)*.15,Math.abs(hi)*.025,.5),vmin=lo-pad,vmax=hi+pad;
  const x=(i)=>left+(i/(data.length-1))*w;
  const y=(v)=>top+(vmax-v)/(vmax-vmin)*h;
  const path=values.map((v,i)=>(i===0?"M":"L")+x(i).toFixed(1)+" "+y(v).toFixed(1)).join(" ");
  let grid="";
  for(let i=0;i<5;i++){const yy=top+i*h/4;const label=num(vmax-i*(vmax-vmin)/4,1);grid+='<line class="chart-grid-line" x1="'+left+'" y1="'+yy+'" x2="'+(W-right)+'" y2="'+yy+'"/><text class="chart-label" x="'+(left-9)+'" y="'+(yy+4)+'" text-anchor="end">'+label+'</text>';}
  const first=data[0].cycle,last=data[data.length-1].cycle;
  const id="chart-"+key.replace(/[^a-z0-9]/gi,"");
  return '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-labelledby="'+id+'"><title id="'+id+'">'+esc(label)+' de '+esc(first)+' à '+esc(last)+'</title><defs><linearGradient id="fill-'+key+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#20aea1" stop-opacity=".20"/><stop offset="100%" stop-color="#20aea1" stop-opacity="0"/></linearGradient></defs>'+grid+'<path d="'+path+' L '+x(data.length-1)+' '+(top+h)+' L '+left+' '+(top+h)+' Z" fill="url(#fill-'+key+')"/><path d="'+path+'" fill="none" stroke="#179c91" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="'+x(data.length-1)+'" cy="'+y(values[values.length-1])+'" r="4.5" fill="#179c91" stroke="white" stroke-width="2"/><text class="chart-label" x="'+left+'" y="'+(H-6)+'">Cycle '+esc(first)+'</text><text class="chart-label" x="'+(W-right)+'" y="'+(H-6)+'" text-anchor="end">Cycle '+esc(last)+'</text></svg>';
}
function spotlights() {
  const e=selectedAssessment();
  $("trendSubtitle").textContent=e ? "Flotte "+e.subset+" · Moteur "+e.unit+" · historique des cycles" : "Sélectionnez un moteur pour afficher ses cycles";
  $("overviewChart").innerHTML=state.detail ? chart(state.detail.history,"rul","RUL estimé (cycles)") : '<div class="empty">Historique indisponible.</div>';
  $("spotlight").innerHTML=e ? '<div class="spotlight-top"><div class="spotlight-engine">ENG–'+esc(e.unit)+'<small>'+esc(e.subset)+' · '+num(e.cycles_flown)+' cycles parcourus</small></div>'+tag(e.status)+'</div><div><span class="big-rul">'+num(e.rul,1)+' <small>cycles restants</small></span></div><div class="detail-split"><div class="detail-info"><span>Intervalle 80 %</span><strong>'+num(e.rul_low,1)+' – '+num(e.rul_high,1)+'</strong></div><div class="detail-info"><span>Confiance statut</span><strong>'+num(Number(e.confidence)*100,1)+' %</strong></div></div><div class="detail-note">Les estimations sont issues d’un modèle prédictif sur données simulées et nécessitent une interprétation humaine.</div>' : '<p class="empty">Aucune évaluation disponible.</p>';
}
function fleetCards() {
  $("fleetCards").innerHTML=state.fleets.map((f)=>'<button class="fleet-card '+(state.fleet===f.subset?"active":"")+'" data-fleet="'+esc(f.subset)+'"><span class="fleet-card-head"><strong>'+esc(f.subset)+'</strong><span>↗</span></span><span class="fleet-card-count">'+num(f.engines)+'<small>moteurs</small></span><div class="fleet-card-foot"><span>● <b>'+num(f.status_counts?.inspect_now)+'</b> prioritaires</span><span>· '+num(f.status_counts?.plan_inspection)+' à planifier</span></div></button>').join("");
}
function engineTable() {
  const search=$("searchInput").value.trim().toLowerCase();
  const filter=$("statusFilter").value;
  const engines=activeEngines().filter((e)=>(filter==="all" || e.status===filter) && (String(e.unit).includes(search) || String(e.subset).toLowerCase().includes(search)));
  const sorting=$("sortSelect")?.value || "rul_asc";
  const sortable = {
    rul_asc:(a,b)=>Number(a.rul)-Number(b.rul),
    rul_desc:(a,b)=>Number(b.rul)-Number(a.rul),
    cycles_desc:(a,b)=>Number(b.cycles_flown)-Number(a.cycles_flown),
    confidence_asc:(a,b)=>Number(a.confidence)-Number(b.confidence),
    unit_asc:(a,b)=>Number(a.unit)-Number(b.unit)
  };
  engines.sort(sortable[sorting] || sortable.rul_asc);
  $("fleetTableTitle").textContent="Inventaire moteurs · "+(state.fleet || "—");
  $("engineCountLabel").textContent=num(engines.length)+" moteurs";
  $("engineRows").innerHTML=engines.length?engines.map((e)=>'<tr class="'+(Number(e.unit)===state.unit?"selected":"")+'"><td class="engine-id">ENG–'+esc(e.unit)+'</td><td>'+tag(e.status)+'</td><td><strong>'+num(e.rul,1)+' cycles</strong></td><td>'+num(e.rul_low,1)+' – '+num(e.rul_high,1)+'</td><td>'+num(e.cycles_flown)+'</td><td>'+num(Number(e.confidence)*100,1)+' %</td><td><button class="table-select" data-unit="'+e.unit+'" aria-label="Afficher moteur '+e.unit+'">Détails ↗</button></td></tr>').join(""):'<tr><td colspan="7" class="empty">Aucun moteur ne correspond aux filtres.</td></tr>';
}
function engineDetails() {
  const e=selectedAssessment();
  if (!e) { $("engineDetails").innerHTML='<p class="empty">Sélectionnez un moteur pour consulter son diagnostic.</p>';return; }
  const sensors=state.detail?.sensors || {};
  const hist=state.detail?.history || [];
  const last=hist[hist.length-1] || {};
  const sensorOptions = Object.entries(sensors).filter(([k]) => /^[a-z][a-z0-9_]*$/i.test(k));
  const firstSensor = sensorOptions[0]?.[0];
  const sensorSelector = firstSensor
    ? '<div class="sensor-control"><label for="sensorMetric">Évolution du capteur observé</label><select id="sensorMetric" aria-label="Choisir le capteur observé">' + sensorOptions.map(([k,description]) => '<option value="' + esc(k) + '">' + esc(description) + '</option>').join("") + '</select></div><div id="sensorTrend" class="detail-chart">' + chart(hist, firstSensor, sensors[firstSensor]) + '</div>'
    : '<p class="small-note">Aucun historique de capteur fourni.</p>';
  $("engineDetails").innerHTML='<div class="engine-id-head"><span class="engine-mini-icon">✈</span><div><h2>ENG–'+esc(e.unit)+'</h2><p>'+esc(e.subset)+' · '+num(e.cycles_flown)+' cycles parcourus</p></div></div><div class="engine-rul"><div><span>DURÉE DE VIE RÉSIDUELLE</span><strong>'+num(e.rul,1)+' <small>cycles</small></strong></div><span class="rul-icon">⌁</span></div><div class="detail-split"><div class="detail-info"><span>Statut</span>'+tag(e.status)+'</div><div class="detail-info"><span>Confiance statut</span><strong>'+num(Number(e.confidence)*100,1)+' %</strong></div><div class="detail-info"><span>Intervalle 80 %</span><strong>'+num(e.rul_low,1)+' – '+num(e.rul_high,1)+'</strong></div><div class="detail-info"><span>Cycles parcourus</span><strong>'+num(e.cycles_flown)+'</strong></div></div><h4 class="engine-section-title">Tendance RUL</h4><div class="detail-chart">'+chart(hist,"rul","RUL du moteur "+e.unit)+'</div>'+sensorSelector+'<h4 class="engine-section-title">Dernières mesures normalisées</h4>'+Object.entries(sensors).map(([k,description])=>'<div class="sensor-row"><span title="'+esc(description)+'">'+esc(description)+'</span><strong>'+num(last[k],3)+'</strong></div>').join("")+'<p class="small-note">Capteurs normalisés pour le modèle, sans unités physiques. Analyse d’aide à la décision uniquement.</p><div class="engine-ai-actions"><span>ANALYSE ASSISTÉE / CONTEXTE MOTEUR CONSERVÉ</span><button type="button" class="btn btn-primary" data-copilot-intent="risk">Évaluer la priorité ↗</button><button type="button" class="btn btn-outline" data-copilot-intent="uncertainty">Analyser l’incertitude ↗</button><button type="button" class="btn btn-outline" data-copilot-intent="sensors">Interpréter les capteurs ↗</button></div>';
}
function selectors() {
  const fleetSel=$("assistantFleet"),engineSel=$("assistantEngine");
  fleetSel.innerHTML=state.fleets.map((f)=>'<option value="'+esc(f.subset)+'">'+esc(f.subset)+'</option>').join("");
  fleetSel.value=state.fleet||"";
  engineSel.innerHTML=activeEngines().map((e)=>'<option value="'+e.unit+'">ENG–'+e.unit+' · '+num(e.rul,1)+' cycles</option>').join("");
  engineSel.value=state.unit==null?"":String(state.unit);
}
function render() { metrics();fleetDistribution();priorities();spotlights();fleetCards();engineTable();engineDetails();selectors();controlRoom(); }
async function switchFleet(subset) {
  if (state.loading) return;
  clearError();
  try { await loadFleet(subset, { fresh:false }); } catch(e) { error("Chargement flotte "+subset+" : "+e.message); }
}
function showView(view) {
  if (!["overview","fleet","assistant","audit","industry"].includes(view)) return;
  state.view=view;
  document.querySelectorAll(".view").forEach((el)=>{el.hidden=el.dataset.section!==view;});
  document.querySelectorAll(".nav-link").forEach((button)=>{const active=button.dataset.view===view;button.classList.toggle("active",active);if(active)button.setAttribute("aria-current","page");else button.removeAttribute("aria-current");});
  const names={overview:"Centre de contrôle",fleet:"Diagnostic flotte",assistant:"Copilote d’analyse",audit:"Traçabilité",industry:"Écosystème aviation"};
  $("breadcrumbCurrent").textContent=names[view];
  $("sidebar").classList.remove("open");$("backdrop").hidden=true;
  window.scrollTo({top:0,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  if(view==="audit")loadAudit();
}
async function loadAudit() {
  try {
    const rows=await api("/audit?limit=50");
    if (!Array.isArray(rows)) throw new Error("Structure d’audit invalide.");
    state.audit=rows;
    $("auditRows").innerHTML=rows.length?rows.map((r)=>'<tr><td>'+esc(r.at)+'</td><td class="engine-id">'+esc(r.tool)+'</td><td>'+tag(r.decision)+'</td><td>'+esc(r.engine?.subset||"—")+' / '+esc(r.engine?.unit??"—")+'</td><td><span class="audit-reason" title="'+esc(r.reason)+'">'+esc(r.reason||"—")+'</span></td></tr>').join(""):'<tr><td colspan="5" class="empty">Aucun appel d’outil enregistré sur cette instance. Le journal n’est pas persistant.</td></tr>';
  } catch(e) {$("auditRows").innerHTML='<tr><td colspan="5" class="empty">Journal indisponible : '+esc(e.message)+'</td></tr>';}
}
function downloadCSV() {
  const rows=activeEngines();
  if(!rows.length){error("Aucune donnée moteur à exporter.");return;}
  const cols=["subset","unit","cycles_flown","rul","rul_low","rul_high","status","confidence"];
  const quote=(v)=>{const text=String(v??"");return '"'+(/^[=+@]/.test(text)? "'"+text : text).replace(/"/g,'""')+'"';};
  const body="\ufeff"+cols.join(";")+"\r\n"+rows.map((r)=>cols.map((c)=>quote(r[c])).join(";")).join("\r\n");
  const url=URL.createObjectURL(new Blob([body],{type:"text/csv;charset=utf-8;"}));
  const a=document.createElement("a");a.href=url;a.download="aeromro_"+state.fleet+"_moteurs.csv";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}

const chatHistory = [];
function renderChat(pending = false) {
  const target = $("aiOutput");
  const renderMessage = (entry) => {
    const isUser = entry.role === "user";
    if (isUser) {
      return '<article class="chat-message user"><div class="chat-avatar" aria-hidden="true">VO</div><div class="chat-body"><div class="chat-topline"><strong>Votre question</strong><span>' + esc(entry.subset) + ' / ENG–' + esc(entry.unit) + '</span></div><div class="chat-text">' + esc(entry.question) + '</div></div></article>';
    }
    if (entry.role === "error") {
      return '<article class="chat-message failure"><div class="chat-avatar" aria-hidden="true">!</div><div class="chat-body"><div class="chat-topline"><strong>Réponse indisponible</strong></div><div class="chat-text">' + esc(entry.message) + '</div><div class="chat-source">Aucune réponse IA n’a été inventée.</div></div></article>';
    }
    const p = entry.policy || {}, u = entry.usage || {};
    const decision = p.decision || "unknown";
    const policyMessage = entry.requiresApproval
      ? "Revue humaine requise avant toute action. " + (p.reason || "")
      : "Décision de la politique : " + (statusText[decision] || decision) + ". Aucune autorisation de navigabilité n’est émise.";
    const tags = [
      "Modèle : " + (u.model || "non communiqué"),
      "Latence : " + num(u.latency_ms, 1) + " ms",
      "Jetons : " + num((u.input_tokens || 0) + (u.output_tokens || 0)),
    ];
    if (entry.fallbackReason) tags.push("Mode de repli actif : " + entry.fallbackReason);
    const m = entry.engine || {};
    const hasFacts = ["rul", "rul_low", "rul_high", "cycles_flown"].every((k) => m[k] !== null && m[k] !== undefined && m[k] !== "" && Number.isFinite(Number(m[k])));
    const factsHtml = hasFacts
      ? '<div class="copilot-verified-facts"><div class="verified-head"><strong>↗ Valeurs fournies par le modèle RUL</strong><small>Résultat structuré de l’API AWS</small></div><div class="verified-values"><div><span>Cycles restants (RUL)</span><strong>' + num(m.rul, 1) + '</strong></div><div><span>Intervalle prévisionnel 80 %</span><strong>' + num(m.rul_low, 1) + ' – ' + num(m.rul_high, 1) + '</strong></div><div><span>Cycles déjà parcourus</span><strong>' + num(m.cycles_flown) + '</strong></div><div><span>Priorité calculée</span>' + tag(m.status) + '</div></div><p>La priorité compare les <strong>cycles restants</strong> aux seuils ; elle ne compare pas les cycles déjà parcourus. Le texte généré par l’IA peut contenir des erreurs d’interprétation.</p></div>'
      : '<div class="chat-policy deny">Les valeurs RUL structurées ne sont pas disponibles : ne prenez aucune décision à partir de ce texte.</div>';
    const trace = '<div class="copilot-model-trace"><span>✧ ' + esc(u.model || "Modèle non identifié") + '</span><span>◷ ' + num(u.latency_ms, 1) + ' ms</span>' + (entry.fallbackReason ? '<span class="trace-fallback">Mode de repli : ' + esc(entry.fallbackReason) + '</span>' : '<span>Réponse obtenue sans repli déclaré</span>') + '</div>';
    return '<article class="chat-message assistant"><div class="chat-avatar" aria-hidden="true">✧</div><div class="chat-body"><div class="chat-topline"><strong>AeroMRO Copilot</strong><span>' + esc(entry.subset) + ' · ENG–' + esc(entry.unit) + '</span>' + tag(decision) + '</div>' + trace + factsHtml + '<div class="copilot-analysis-label">SYNTHÈSE IA · INTERPRÉTATION NON CERTIFIÉE</div><div class="chat-text">' + esc(entry.answer) + '</div><div class="chat-policy ' + esc(decision) + '">' + esc(policyMessage) + '</div><div class="chat-source">Données NASA C-MAPSS simulées · API /ask · aucune décision de vol</div><div class="chat-meta">' + tags.map(t => '<span>' + esc(t) + '</span>').join("") + '</div></div></article>';
  };
  const waiting = pending ? '<article class="chat-message pending"><div class="chat-avatar" aria-hidden="true">✧</div><div class="chat-body"><div class="chat-topline"><strong>AeroMRO Copilot</strong><span>Analyse en cours</span></div><div>Interrogation du service IA AWS… <span aria-label="Patientez">◌</span></div></div></article>' : "";
  target.innerHTML = '<div class="ai-thread">' + chatHistory.map(renderMessage).join("") + waiting + '</div>';
  target.scrollTop = target.scrollHeight;
  if ($("chatHistoryCount")) $("chatHistoryCount").textContent = chatHistory.length ? Math.ceil(chatHistory.length / 2) + " échanges dans cet onglet" : "Aucun échange";
  if ($("chatClearButton")) $("chatClearButton").disabled = !chatHistory.length || pending;
}
async function ask(e) {
  e.preventDefault();
  const subset = $("assistantFleet").value;
  const unit = Number($("assistantEngine").value);
  const question = $("questionInput").value.trim();
  const button = $("askButton");
  if (button.disabled || !/^FD00[1-4]$/.test(subset) || !Number.isSafeInteger(unit) || unit < 1 || question.length < 3 || question.length > 500) return;
  button.disabled = true;
  button.textContent = "Analyse en cours…";
  chatHistory.push({ role:"user", subset, unit, question });
  if (chatHistory.length > 14) chatHistory.splice(0, 2);
  renderChat(true);
  try {
    const r = await api("/ask", { method:"POST", body:{subset,unit,question} });
    if (!r || typeof r.answer !== "string" || !r.answer.trim()) throw new Error("Le service n’a fourni aucune réponse exploitable.");
    chatHistory.push({
      role:"assistant", subset, unit, answer:r.answer, policy:r.policy || {},
      usage:r.usage || {}, requiresApproval:Boolean(r.requires_approval),
      fallbackReason:r.fallback_reason || null, engine:r.engine || null
    });
    renderChat(false);
  } catch (err) {
    chatHistory.push({ role:"error", message:"Le service IA a échoué : " + (err?.message || "erreur inconnue") });
    renderChat(false);
  } finally {
    button.disabled = false;
    button.innerHTML = '✧ Analyser le moteur <span>↗</span>';
  }
}
document.addEventListener("click",async(e)=>{
  const button=e.target.closest("button");if(!button)return;
  if(button.dataset.copilotIntent) {
    const questions={
      risk:"Analyse le RUL restant du moteur sélectionné par rapport au seuil d’inspection. Utilise les valeurs structurées, précise l’intervalle à 80 %, les incertitudes et les contrôles humains nécessaires.",
      uncertainty:"Explique les limites de l’intervalle de prédiction RUL de ce moteur et les mesures à vérifier avant toute décision de maintenance.",
      sensors:"Quels signaux capteurs sont associés au moteur sélectionné ? Distingue les faits transmis par l’API des hypothèses et précise les données non disponibles."
    };
    const question=questions[button.dataset.copilotIntent];
    if(question && state.fleet && state.unit!=null){
      showView("assistant");
      $("questionInput").value=question;
      if($("askForm").reportValidity()) $("askForm").requestSubmit();
    }
    return;
  }
  if(button.dataset.view)showView(button.dataset.view);
  if(button.dataset.priorityFleet && button.dataset.priorityFleet !== state.fleet) await switchFleet(button.dataset.priorityFleet);
  if(button.dataset.unit){await loadEngine(button.dataset.unit);if(button.dataset.jump)showView(button.dataset.jump);}
  else if(button.dataset.jump)showView(button.dataset.jump);
  if(button.dataset.fleet)await switchFleet(button.dataset.fleet);
});
$("searchInput").addEventListener("input",engineTable);
$("statusFilter").addEventListener("change",engineTable);
$("sortSelect").addEventListener("change",engineTable);
$("resetFilters").addEventListener("click", () => { $("searchInput").value = ""; $("statusFilter").value = "all"; $("sortSelect").value = "rul_asc"; engineTable(); });
document.addEventListener("change", (event) => {
  if (event.target?.id !== "sensorMetric" || !state.detail) return;
  const key = event.target.value;
  if (!Object.prototype.hasOwnProperty.call(state.detail.sensors || {},key)) return;
  $("sensorTrend").innerHTML = chart(state.detail.history,key,state.detail.sensors[key]);
});
$("chatClearButton").addEventListener("click", () => { chatHistory.length = 0; renderChat(); });
$("assistantFleet").addEventListener("change",async(e)=>{await switchFleet(e.target.value);});
$("assistantEngine").addEventListener("change",async(e)=>{await loadEngine(e.target.value);});
$("askForm").addEventListener("submit",ask);
$("refreshButton").addEventListener("click",()=>init(true));
$("auditRefresh").addEventListener("click",loadAudit);
$("exportButton").addEventListener("click",downloadCSV);
$("fleetExportButton").addEventListener("click",downloadCSV);
$("menuButton").addEventListener("click",()=>{$("sidebar").classList.add("open");$("backdrop").hidden=false;});
$("backdrop").addEventListener("click",()=>{$("sidebar").classList.remove("open");$("backdrop").hidden=true;});
document.addEventListener("keydown",(e)=>{if(e.key==="Escape"){$("sidebar").classList.remove("open");$("backdrop").hidden=true;}});
init();
setInterval(()=>{if(!document.hidden && !state.loading)init(true);},90000);
