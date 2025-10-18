// ===== Constants =====
const FEATURE_PROVIDER = './api/feature.php';
const TILEMAP_PROVIDER = 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png';

// ====== Map setup ======
const map = L.map('map', { zoomControl: false }).setView([25.04, 121.55], 12);
L.tileLayer(TILEMAP_PROVIDER, {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> &copy; CARTO', maxZoom: 19
}).addTo(map);

// ====== State ======
let currentMode = 'demand'; // demand | supply | diff | ratio
let currentTime = 'm';      // m | a | e
let addMode = false;        // add-lot mode

// ====== Controls: modes ======
document.querySelectorAll('.mode-switch .btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.mode-switch .btn').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    recolor();
    refreshLegend();
  });
});

// ====== Controls: time segments ======
document.querySelectorAll('.segments .seg').forEach(seg=>{
  seg.addEventListener('click', ()=>{
    document.querySelectorAll('.segments .seg').forEach(x=>x.classList.remove('active'));
    seg.classList.add('active');
    currentTime = seg.dataset.time; // m|a|e
    recompute();
  });
});

// Keyboard shortcuts: 1/2/3 for time; A for add lots; D/S/F/R for modes
window.addEventListener('keydown', (e)=>{
  const k = e.key.toLowerCase();
  if (k==='1'||k==='2'||k==='3') {
    const idx = { '1':'m', '2':'a', '3':'e' }[k];
    document.querySelector(`.segments .seg[data-time="${idx}"]`).click();
  }
  if (k==='a') document.getElementById('btnAddLots').click();
  if (k==='d') document.querySelector('.mode-switch .btn[data-mode="demand"]').click();
  if (k==='s') document.querySelector('.mode-switch .btn[data-mode="supply"]').click();
  if (k==='f') document.querySelector('.mode-switch .btn[data-mode="diff"]').click();
  if (k==='r') document.querySelector('.mode-switch .btn[data-mode="ratio"]').click();
  if (k==='enter') document.getElementById('applyW').click();
});

// ====== Toggle groups ======
const weightsPanel = document.getElementById('weightsPanel');
const toggleWeights = document.getElementById('toggleWeights');
toggleWeights.addEventListener('click', ()=>{
  const collapsed = weightsPanel.classList.toggle('collapsed');
  toggleWeights.setAttribute('aria-expanded', String(!collapsed));
});

const chkGrid = document.getElementById('chkGrid');
const chkLots = document.getElementById('chkLots');
const chkPOI  = document.getElementById('chkPOI');

if (chkGrid) chkGrid.addEventListener('change', ()=> setGridVisible(chkGrid.checked));
if (chkLots) chkLots.addEventListener('change', ()=> toggleLots(chkLots.checked));
if (chkPOI)  chkPOI .addEventListener('change', ()=> togglePOI (chkPOI .checked));

// ====== Weights ======
const defaultWeights = {
  wholesale_m: 1.0, wholesale_a: 0.6, wholesale_e: 0.3,
  retail_m: 0.5,    retail_a: 1.0,    retail_e: 0.6,
  post_m: 0.8,      post_a: 1.0,      post_e: 0.7,
  food_m: 0.9,      food_a: 1.0,      food_e: 0.8,
  supply: 1.0
};
function resetWeights(){
  Object.entries(defaultWeights).forEach(([id, v])=>{
    const el = document.getElementById(id) || document.getElementById('supply_weight');
    if (el) el.value = v;
  });
}
function W(id){ return parseFloat(document.getElementById(id)?.value || 0); }
resetWeights();

document.getElementById('resetW').addEventListener('click', ()=>{ resetWeights(); recompute(); });
document.getElementById('applyW').addEventListener('click', ()=>{ recompute(); });
document.getElementById('supply_weight').addEventListener('input', ()=>{ recompute(); });

// ====== Theming thresholds & palette (neon) ======
const thresholds = {
  demand: [10, 30, 60, 120],
  supply: [5,  15, 30,  60],
  diff:   [-20, -5,  5,  20],
  ratio:  [50, 100, 200, 400]
};

const colorRamps = {
  blues: ['#ccefff', '#99daff', '#66c2ff', '#33a3ff', '#0084ff'],
  pinks: ['#ffdef3', '#ffb1e5', '#ff85dc', '#ff58d5', '#ff2bd5'],
  blueToPink: ['#00eeff', '#66e0ff', '#ccefff', '#ff85dc', '#ff2bd5']
};

const getColorRamp = (mode = currentMode) => {
  switch (mode) {
    case 'supply':
      return colorRamps.blues;

    case 'demand':
      return colorRamps.pinks;

    case 'diff':
      return [...colorRamps.blueToPink].reverse();

    default:
      return colorRamps.blueToPink;
  }
}

function getColor(properties, mode = currentMode) {
  const c = getColorRamp(mode);
  const t = thresholds[mode];
  const v = properties[mode];

  if ((mode == 'ratio') & (properties['supply'] < 0)) return properties['demand'] > 0 ? c[0] : c[4];
  if ((v === null) || (Number.isNaN(v))) return c[0];
  if (v >= t[3]) return c[4];
  if (v >= t[2]) return c[3];
  if (v >= t[1]) return c[2];
  if (v >= t[0]) return c[1];
  return c[0];
}

// ====== Data & Grid ======
let gridLayer = null;
let data = null;

/**
 * Fetch the resource from the provider API.
 * @param {'grid' | 'lot' | 'poi'} id The id of the resource.
 * @param {string} name The name of the resource. 
 * @param {(value: Promise<any>) => void} success The callback function on success.
 * @param {(reason: any) => void | PromiseLike<void>} rejected The callback function on rejected.
 */
const fetchData = (id, name, success = () => {}, rejected = () => {}) => {
  fetch(FEATURE_PROVIDER, {method: 'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: `feature=${id}`})
  .then(r => {
    if (!r.ok) {
      throw new Error(`API: ${r.status}`);
    }
    return r.json();
  })
  .then(success)
  .catch(err => {
    console.log(`讀取${name}失敗：`, err);
    rejected;
  });
}

const getGridLayer = () => {
  return L.geoJSON(data, {
      style: f => ({color:'#152033', weight:0.6, opacity:0.8, fillOpacity:0.8, fillColor: getColor(f.properties) }),
      onEachFeature: (f, layer) => {
        // Hover glow & elevate
        layer.on('mouseover', function(){ this.setStyle({ weight:1.6, color:'#7afcff' }); });
        layer.on('mouseout',  function(){ this.setStyle({ weight:0.6, color:'#152033' }); });

        layer.bindPopup(()=>{
          const p = f.properties;
          const sW = W('supply_weight');
          const frac = p.userFrac || 0;
          return `
            <div style="font-size:12px; line-height:1.35">
              <div style="font-weight:700; letter-spacing:.03em; margin-bottom:4px">網格：${p.Index ?? '-'}</div>
              <div>需求：<b>${fmt(p.demand)}</b></div>
              <div>供給：<b>${fmt(p.supply)}</b> <small style="color:#9fb7cc">＝(原始 ${fmt(p['供給']||0)} + 使用者 ${fmt(frac)}×8) × 權重 ${fmt(sW)}</small></div>
              <div>使用者 buffer 覆蓋比例：${fmt(frac)}；未加權供給：${fmt(p.userSupply||0)}</div>
              <div>差額：<b style="color:${p.diff>=0?'#58ff9c':'#ff6d6d'}">${fmt(p.diff)}</b></div>
              <div>比率：<b>${fmt(p.ratio)} %</b></div>
            </div>`;
        });
      }
  }).addTo(map);
};

fetchData('grid', '網格',
  success = json => {
    data = json;
    // init user props
    data.features.forEach(f=>{
      f.properties.userFrac   = 0;
      f.properties.userSupply = 0;
      f.properties.userCount  = 0;
    });

    recompute();
    gridLayer = getGridLayer();

    map.fitBounds(gridLayer.getBounds(), { padding:[20,20] });
    refreshLegend();

    // restore user points
    restoreUserLots();
  }
)

function setGridVisible(on){
  if (on){
    if (!gridLayer && data){
      gridLayer = getGridLayer();
      recolor();
    } else if (gridLayer && !map.hasLayer(gridLayer)) { gridLayer.addTo(map); recolor(); }
    refreshLegend();
  } else {
    if (gridLayer && map.hasLayer(gridLayer)) map.removeLayer(gridLayer);
    if (legendEl) { legendEl.remove(); legendEl = null; }
  }
}

// ====== Compute (same formulas; no logic change) ======
function recompute(){
  if(!data) return;
  const suf = ({m:'_m', a:'_a', e:'_e'})[currentTime];
  const sW  = W('supply_weight');

  data.features.forEach(f=>{
    const p = f.properties;
    const wholesale = p['批發'] || 0;
    const retail    = p['零售'] || 0;
    const post      = p['郵政'] || 0;
    const food      = p['餐飲'] || 0;
    const supplyRaw = p['供給'] || 0;

    const D =
      wholesale * W('wholesale'+suf) +
      retail    * W('retail'   +suf) +
      food      * W('food'     +suf) +
      post      * W('post'     +suf);

    const userSupply = (p.userFrac || 0) * 8;  // 未加權
    const S = (supplyRaw + userSupply) * sW;   // 再乘供給權重

    p.demand     = D;
    p.supply     = S;
    p.userSupply = userSupply;
    p.diff       = S - D;
    p.ratio      = S > 0 ? (D / S * 100) : (D > 0 ? Infinity : 0);
  });

  recolor();
  refreshLegend();
}

function recolor(){
  if(!gridLayer) return;
  gridLayer.eachLayer(l=>{
    l.setStyle({ fillColor: getColor(l.feature.properties) });
  });
}

// ====== Legend ======
let legendEl = null;
function refreshLegend(){
  if (legendEl) {
    legendEl.remove();
    legendEl = null;
  }

  const t = thresholds[currentMode];
  const nm = { demand: '需求', supply: '供給', diff: '差額', ratio: '比率 (%)' }[currentMode];
  const c = getColorRamp();

  const div = document.createElement('div');
  div.className = 'legend glass legend-left';

  div.innerHTML =
    `<div class="title">${nm}</div>` +
    [`≤ ${t[0]}`, `${t[0]}–${t[1]}`, `${t[1]}–${t[2]}`, `${t[2]}–${t[3]}`, `> ${t[3]}`]
      .map((s, i) => `<div><i style="background:${c[i]}"></i>${s}</div>`)
      .join('');

  map.getContainer().appendChild(div);
  legendEl = div;
}

function fmt(x){
  if (x===null || x===undefined || Number.isNaN(x)) return '-';
  const v = Number(x);
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 100) return v.toFixed(1);
  return v.toFixed(2);
}

/* ====== User-added lot points (drag / right-click delete) ====== */
let userLotsLayer = L.layerGroup().addTo(map);
let userLots = []; // { id, marker }
const btnAddLots   = document.getElementById('btnAddLots');
const btnClearLots = document.getElementById('btnClearLots');

btnAddLots.addEventListener('click', ()=>{
  addMode = !addMode;
  btnAddLots.classList.toggle('active', addMode);
  btnAddLots.textContent = addMode ? '🖱 點地圖以新增（再次按 A / 點此退出）' : '➕ 新增車格（A）';
  map.getContainer().classList.toggle('adding-lots', addMode);
  if (addMode) map.closePopup();
});

if (btnClearLots){
  btnClearLots.addEventListener('click', ()=>{
    if (!confirm('確定清空所有使用者新增的車格點？')) return;
    userLots.forEach(pt => userLotsLayer.removeLayer(pt.marker));
    userLots = [];
    saveUserLots();
    updateUserSupplyFromPoints();
    recompute();
  });
}

map.on('click', (e)=>{
  if (!addMode) return;
  const m = createDraggableMarker(e.latlng);
  userLotsLayer.addLayer(m);
  userLots.push({ id: genId(), marker: m });
  saveUserLots();
  updateUserSupplyFromPoints();
  recompute();
});

function createDraggableMarker(latlng){
  const marker = L.marker(latlng, { draggable:true, opacity:0.98, riseOnHover:true });
  marker.bindTooltip(`新增的車格（右鍵刪除，拖曳可移動）`, {permanent:false});
  marker.on('dragend', ()=>{ updateUserSupplyFromPoints(); recompute(); });
  marker.on('contextmenu', ()=>{
    userLots = userLots.filter(pt => pt.marker !== marker);
    userLotsLayer.removeLayer(marker);
    saveUserLots();
    updateUserSupplyFromPoints();
    recompute();
  });
  // Subtle neon ring
  const ring = L.circleMarker(latlng, { radius: 10, color:'#7afcff', weight:1, opacity:.7, fillOpacity:0 }).addTo(userLotsLayer);
  marker.on('move', e=> ring.setLatLng(e.latlng));
  marker.on('remove', ()=> userLotsLayer.removeLayer(ring));
  return marker;
}

function genId(){ return Math.random().toString(36).slice(2,10); }

// 50m buffer ∩ grid, distribute by area fraction
function updateUserSupplyFromPoints(){
  if (!data) return;
  data.features.forEach(f=>{ f.properties.userFrac=0; f.properties.userSupply=0; f.properties.userCount=0; });
  if (userLots.length===0) return;

  userLots.forEach(pt=>{
    const ll = pt.marker.getLatLng();
    const ptTurf = turf.point([ll.lng, ll.lat]);
    const buf = turf.buffer(ptTurf, 50, { units:'meters' });
    const bufArea = turf.area(buf);
    if (!bufArea || bufArea<=0) return;

    data.features.forEach(f=>{
      const poly = f.geometry; if (!poly) return;
      const inter = turf.intersect(buf, poly);
      if (inter){
        const interArea = turf.area(inter);
        if (interArea>0){
          const frac = interArea / bufArea;
          f.properties.userFrac += frac;
          f.properties.userCount += 1;
        }
      }
    });
  });
  data.features.forEach(f=>{ f.properties.userSupply = (f.properties.userFrac || 0) * 8; });
}

function saveUserLots(){
  const arr = userLots.map(pt=>{ const ll=pt.marker.getLatLng(); return { id:pt.id, lat:ll.lat, lng:ll.lng }; });
  localStorage.setItem('userLots', JSON.stringify(arr));
}

function restoreUserLots(){
  const raw = localStorage.getItem('userLots'); if (!raw) return;
  try{
    const arr = JSON.parse(raw);
    arr.forEach(rec=>{
      const m = createDraggableMarker({lat:rec.lat, lng:rec.lng});
      userLotsLayer.addLayer(m);
      userLots.push({ id: rec.id || genId(), marker:m });
    });
    updateUserSupplyFromPoints();
    recompute();
  }catch(e){ console.warn('無法解析 userLots：', e); }
}

/* ====== Extra data layers ====== */
let lotLayer = null;
let poiLayer = null;

function toggleLots(on){
  if (on && !lotLayer){
    fetchData('lot', '卸貨車格',
      success = json => {
        lotLayer = L.geoJSON(json, {
          pointToLayer: (f,latlng)=> L.circleMarker(latlng, { radius: 4, color:'#0af', weight:1, fillColor:'#7afcff', fillOpacity:0.9 }),
          onEachFeature: (f,l)=> l.bindTooltip(f.properties?.name || '卸貨車格', {permanent:false})
        }).addTo(map);
      },
      rejected = () => {
        if (chkLots) chkLots.checked=false;
      }
    );
  } else if (!on && lotLayer) {
    map.removeLayer(lotLayer);
    lotLayer = null;
  }
}

function togglePOI(on){
  if (on && !poiLayer){
    fetchData('poi', '商家點位',
      success = json => {
        poiLayer = L.geoJSON(json, {
          pointToLayer: (f,latlng)=> L.circleMarker(latlng, { radius: 3.5, color:'#ff6ad5', weight:1, fillColor:'#ff9adf', fillOpacity:0.85 }),
          onEachFeature: (f,l)=> l.bindTooltip(f.properties?.name || '商家', {permanent:false})
        }).addTo(map);
      },
      rejected = () => {
        if (chkPOI) chkPOI.checked=false;
      }
    );
  } else if (!on && poiLayer) {
    map.removeLayer(poiLayer);
    poiLayer = null;
  }
}