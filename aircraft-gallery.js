/* AeroMRO Aircraft Library — native, isolated Web Component.
 * Aircraft images are public illustration assets, NOT mappings to NASA C-MAPSS units.
 * Content and credits are curated; no artificial telemetry is generated.
 */
"use strict";

const AIRCRAFT_MODELS = Object.freeze([
  {
    code:"A320", family:"Airbus", name:"A320",
    category:"Monocouloir", use:"Opérations de maintenance en ligne",
    detail:"Une plateforme d'analyse peut rassembler les événements techniques, les historiques et les tendances pour faciliter la préparation des interventions.",
    photo:"https://commons.wikimedia.org/wiki/Special:FilePath/Airbus_A320_%281%29.jpg?width=1100",
    large:"https://commons.wikimedia.org/wiki/Special:FilePath/Airbus_A320_%281%29.jpg?width=1600",
    credit:"Mathious Ier · CC0 1.0",
    creditLink:"https://commons.wikimedia.org/wiki/File:Airbus_A320_(1).jpg",
  },
  {
    code:"A350", family:"Airbus", name:"A350-900",
    category:"Long-courrier", use:"Fiabilité et tendances moteur",
    detail:"Les tableaux de fiabilité et les indicateurs de maintenance prédictive sont des scénarios pertinents pour des opérateurs long-courriers.",
    photo:"https://commons.wikimedia.org/wiki/Special:FilePath/LH_Airbus_A350-900.jpg?width=1100",
    large:"https://commons.wikimedia.org/wiki/Special:FilePath/LH_Airbus_A350-900.jpg?width=1600",
    credit:"Ben Diesendorf · CC0 1.0",
    creditLink:"https://commons.wikimedia.org/wiki/File:LH_Airbus_A350-900.jpg",
  },
  {
    code:"B787", family:"Boeing", name:"787 Dreamliner",
    category:"Long-courrier", use:"Diagnostic de systèmes et composants",
    detail:"L'investigation des événements techniques et le suivi de l'état des équipements sont des usages envisageables après intégration de sources constructeur et opérateur.",
    photo:"https://commons.wikimedia.org/wiki/Special:FilePath/Boeing_787.jpg?width=1100",
    large:"https://commons.wikimedia.org/wiki/Special:FilePath/Boeing_787.jpg?width=1600",
    credit:"Mathious Ier · CC0 1.0",
    creditLink:"https://commons.wikimedia.org/wiki/File:Boeing_787.jpg",
  },
  {
    code:"B777", family:"Boeing", name:"777-200",
    category:"Long-courrier", use:"Planification et anticipation des risques",
    detail:"Une future intégration MRO pourrait lier les tendances de dégradation aux dossiers de maintenance et à une validation par les équipes techniques.",
    photo:"https://commons.wikimedia.org/wiki/Special:FilePath/Boeing_777-AA.jpg?width=1100",
    large:"https://commons.wikimedia.org/wiki/Special:FilePath/Boeing_777-AA.jpg?width=1600",
    credit:"Adrian Pingstone · Domaine public",
    creditLink:"https://commons.wikimedia.org/wiki/File:Boeing_777-AA.jpg",
  },
]);

class AeroAircraftGallery extends HTMLElement {
  #filter="all";
  #root;
  #dialog;
  constructor() {
    super();
    this.#root=this.attachShadow({mode:"open"});
  }
  connectedCallback() {
    this.#root.innerHTML=`
<style>
:host{display:block;color:#183347;font-family:Inter,"DM Sans",system-ui,-apple-system,sans-serif}
*,*::before,*::after{box-sizing:border-box}
button{font:inherit;cursor:pointer}
a{color:inherit}
section{display:block}
.intro{display:flex;justify-content:space-between;align-items:end;gap:24px;margin-bottom:24px}
.kicker{font:800 10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:1.25px;color:#237d85}
h2{font-size:clamp(23px,2.35vw,32px);letter-spacing:-1.25px;line-height:1.18;margin:7px 0 7px;font-weight:780}
.intro p{color:#6f8592;font-size:13px;max-width:620px;line-height:1.55;margin:0}
.segment{display:flex;gap:4px;padding:4px;border:1px solid #d9e5e8;background:#f1f6f7;border-radius:10px;flex-shrink:0}
.segment button{border:0;background:none;color:#627986;padding:10px 14px;border-radius:7px;font-weight:650;font-size:11px}
.segment button[aria-pressed="true"]{background:#fff;color:#173e4d;box-shadow:0 1px 5px #15384913}
.segment button:focus-visible,.model button:focus-visible,dialog button:focus-visible,dialog a:focus-visible{outline:3px solid #299daa;outline-offset:3px}
.result-meta{display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;color:#7b8e99;font-size:11px}
.result-meta b{color:#2b5765}
.library{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px}
.model{border:1px solid #dce6e9;background:#fff;border-radius:12px;overflow:hidden;min-width:0;box-shadow:0 3px 16px #183c4708;transition:border-color .18s,transform .18s,box-shadow .18s}
.model:hover{transform:translateY(-2px);border-color:#b6d3d7;box-shadow:0 8px 30px #1e45541b}
.visual{position:relative;aspect-ratio:1.38;background:linear-gradient(145deg,#dde9ed,#e8f1f2);overflow:hidden}
.visual img{display:block;width:100%;height:100%;object-fit:cover;transition:transform .4s}
.model:hover img{transform:scale(1.035)}
.visual .fallback{position:absolute;inset:0;display:none;place-items:center;background:linear-gradient(135deg,#dbeaf0,#ecf3f5);font-size:13px;letter-spacing:1px;color:#5a7786}
.visual.unavailable .fallback{display:grid}
.visual.unavailable img{display:none}
.image-note{position:absolute;bottom:12px;left:13px;padding:6px 8px;background:#102b3dc9;color:#fff;border-radius:4px;letter-spacing:.45px;font:650 9px ui-monospace,monospace}
.model-content{padding:17px 17px 15px}
.model-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.model h3{font-size:18px;font-weight:780;letter-spacing:-.55px;margin:0 0 6px}
.label{font-size:9px;font-weight:750;letter-spacing:.2px;padding:5px 7px;color:#477682;background:#eaf3f4;border-radius:5px}
.family{font-size:11px;color:#728a96;margin:0 0 13px}
.model-footer{border-top:1px solid #e9eef0;padding-top:11px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.model-footer span{font-size:10px;color:#657f8b;line-height:1.4}
.model-footer button{border:0;background:#e9f2f4;color:#1f6371;padding:8px 10px;border-radius:5px;font-size:10px;font-weight:750;white-space:nowrap}
.model-footer button:hover{background:#d6eaec}
.disclaimer{margin-top:21px;border:1px solid #d8e6e7;border-radius:8px;background:#f1f7f7;display:flex;gap:10px;align-items:start;padding:13px 15px;color:#5b7581;font-size:11px;line-height:1.6}
.disclaimer .dot{width:7px;height:7px;margin-top:5px;flex:none;border-radius:50%;background:#388e93}
dialog{border:1px solid #d7e3e6;border-radius:14px;padding:0;background:#fff;width:min(650px,calc(100vw - 30px));max-height:90vh;overflow:auto;box-shadow:0 25px 90px #0c2a3d50}
dialog::backdrop{background:#0a1f30b3;backdrop-filter:blur(3px)}
.dialog-photo{display:block;position:relative;aspect-ratio:1.95;background:#e8eff1}
.dialog-photo img{width:100%;height:100%;object-fit:cover}
.dialog-body{padding:23px 27px 25px}
.dialog-close{position:absolute;right:14px;top:14px;z-index:2;border:0;border-radius:7px;background:#fff;color:#244858;padding:8px 12px;font-size:12px;font-weight:750}
.dialog-kicker{font:750 10px ui-monospace,monospace;color:#287986;letter-spacing:.7px}
.dialog-body h3{font-size:25px;margin:7px 0 8px}
.dialog-body>p{font-size:13px;color:#617c89;line-height:1.7;margin:0 0 17px}
.dialog-use{border-left:3px solid #228a91;background:#f0f7f7;padding:13px 15px;margin-bottom:17px}
.dialog-use strong{font-size:12px}
.dialog-use p{font-size:12px;line-height:1.6;color:#557480;margin:5px 0 0}
.dialog-foot{border-top:1px solid #e6edef;padding-top:14px;display:flex;gap:15px;justify-content:space-between;align-items:center}
.dialog-foot a{font-size:11px;color:#1f7582;text-underline-offset:2px}
.dialog-foot span{font-size:10px;color:#7a8d95}
@media(max-width:1250px){.library{grid-template-columns:repeat(2,minmax(0,1fr))}.intro{align-items:start;flex-wrap:wrap}}
@media(max-width:650px){.library{grid-template-columns:1fr}.intro{gap:17px}.segment{width:100%}.segment button{flex:1}.model .visual{aspect-ratio:1.8}.model-content{padding:15px}.intro p{font-size:12px}.dialog-body{padding:19px}.dialog-foot{align-items:start;flex-direction:column;gap:8px}}
@media(prefers-reduced-motion:reduce){.model,.model img{transition:none}}
</style>
<section aria-labelledby="aircraftModelsTitle">
  <div class="intro">
    <div><div class="kicker">ÉCOSYSTÈME AVIATION · EXEMPLES SECTORIELS</div>
      <h2 id="aircraftModelsTitle">Des appareils. Des besoins métier.</h2>
      <p>Explorez les usages possibles de la maintenance intelligente pour chaque famille d’appareils.</p>
    </div>
    <div class="segment" role="group" aria-label="Filtrer par constructeur">
      <button type="button" data-filter="all" aria-pressed="true">Tous</button>
      <button type="button" data-filter="Airbus" aria-pressed="false">Airbus</button>
      <button type="button" data-filter="Boeing" aria-pressed="false">Boeing</button>
    </div>
  </div>
  <div class="result-meta"><span id="resultCount" aria-live="polite"></span><span>Photos documentaires · Sources publiques</span></div>
  <div class="library" id="modelList"></div>
  <div class="disclaimer"><span class="dot" aria-hidden="true"></span><span>Illustrations de modèles aéronautiques. Cette galerie n'est pas un inventaire connecté : les moteurs NASA C-MAPSS ne sont associés à aucun avion réel. Aucune relation commerciale ou certification n'est revendiquée.</span></div>
  <dialog aria-labelledby="modelDialogTitle">
    <button class="dialog-close" type="button" data-close aria-label="Fermer le détail">Fermer ✕</button>
    <div id="dialogContent"></div>
  </dialog>
</section>`;
    this.#dialog=this.#root.querySelector("dialog");
    this.#root.addEventListener("click",(event)=>{
      const filter=event.target.closest("[data-filter]");
      if(filter){this.#filter=filter.dataset.filter;this.#renderModels();return;}
      const open=event.target.closest("[data-model]");
      if(open){this.#openModel(open.dataset.model);return;}
      if(event.target.closest("[data-close]"))this.#dialog.close();
    });
    this.#dialog.addEventListener("click",(event)=>{if(event.target===this.#dialog)this.#dialog.close();});
    this.#renderModels();
  }
  #renderModels() {
    const models=AIRCRAFT_MODELS.filter(model=>this.#filter==="all"||model.family===this.#filter);
    for(const button of this.#root.querySelectorAll("[data-filter]"))button.setAttribute("aria-pressed",String(button.dataset.filter===this.#filter));
    this.#root.querySelector("#resultCount").textContent=models.length+" familles d’appareils";
    const list=this.#root.querySelector("#modelList");
    list.innerHTML=models.map(model=>`
      <article class="model">
        <div class="visual"><img src="${model.photo}" alt="${model.family} ${model.name}, photographie documentaire" loading="lazy" decoding="async">
          <span class="fallback" aria-hidden="true">${model.family} ${model.name}</span>
          <span class="image-note">PHOTO DOCUMENTAIRE</span>
        </div>
        <div class="model-content">
          <div class="model-head"><h3>${model.family} ${model.name}</h3><span class="label">${model.category}</span></div>
          <p class="family">Applications aéronautiques envisageables</p>
          <div class="model-footer"><span>${model.use}</span>
            <button type="button" data-model="${model.code}" aria-label="Découvrir les usages pour ${model.family} ${model.name}">Découvrir ↗</button>
          </div>
        </div>
      </article>`).join("");
    this.#bindImages(list);
  }
  #bindImages(container) {
    for(const image of container.querySelectorAll("img")){
      image.addEventListener("error",()=>image.parentElement.classList.add("unavailable"));
      if(image.complete&&image.naturalWidth===0)image.parentElement.classList.add("unavailable");
    }
  }
  #openModel(code) {
    const model=AIRCRAFT_MODELS.find(item=>item.code===code);
    if(!model)return;
    this.#root.querySelector("#dialogContent").innerHTML=`
      <div class="dialog-photo"><img src="${model.large}" alt="${model.family} ${model.name}" loading="lazy"></div>
      <div class="dialog-body">
        <div class="dialog-kicker">SCÉNARIO D’INTÉGRATION · ${model.family.toUpperCase()}</div>
        <h3 id="modelDialogTitle">${model.family} ${model.name}</h3>
        <p>${model.detail}</p>
        <div class="dialog-use"><strong>${model.use}</strong><p>Intégrations et données de flotte à construire avec les systèmes du client. Aucun suivi d'appareil réel n'est actif dans ce prototype.</p></div>
        <div class="dialog-foot"><a href="${model.creditLink}" target="_blank" rel="noopener noreferrer">Crédit photo : ${model.credit} ↗</a><span>Aucune affiliation constructeur</span></div>
      </div>`;
    this.#dialog.showModal();
  }
}
if(!customElements.get("aero-aircraft-gallery"))customElements.define("aero-aircraft-gallery",AeroAircraftGallery);
