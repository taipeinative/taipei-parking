// === 地圖（更乾淨底圖：Carto Light 無標註） ===
const map = L.map('map').setView([25.04, 121.55], 12);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

// === 狀態 ===
let currentMode = 'demand'; // demand | supply | diff | ratio
let currentTime = 'm';      // m | a | e

// === UI: 指標按鈕 ===
document.querySelectorAll('.btns button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.btns button').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    recolor();
    refreshLegend();
  });
});

// === UI: 時段按鈕 ===
document.querySelectorAll('.subbar .seg').forEach(seg=>{
  seg.addEventListener('click', ()=>{
    document.querySelectorAll('.subbar .seg').forEach(x=>x.classList.remove('active'));
    seg.classList.add('active');
    currentTime = seg.dataset.time;   // 'm' | 'a' | 'e'
    recompute();
  });
});

// === UI: 權重面板收合 ===
const weightsPanel = document.getElementById('weightsPanel');
const toggleWeights = document.getElementById('toggleWeights');
toggleWeights.addEventListener('click', ()=>{
  const collapsed = weightsPanel.classList.toggle('collapsed');
  toggleWeights.setAttribute('aria-expanded', String(!collapsed));
});

// === UI: 圖層勾選 ===
const chkLots = document.getElementById('chkLots');
const chkPOI  = document.getElementById('chkPOI');
chkLots.addEventListener('change', ()=>toggleLots(chkLots.checked));
chkPOI .addEventListener('change', ()=>togglePOI (chkPOI .checked));

// === 權重 ===
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
document.getElementById('supply_weight').addEventListener('input', ()=>recompute());

// === 分級 & 色盤 ===
const thresholds = {
  demand: [10, 30, 60, 120],
  supply: [5,  15, 30,  60],
  diff:   [-20, -5,  5,  20],
  ratio:  [50, 100, 200, 400]
};
const colors = ['#4575b4','#a6d96a','#ffffbf','#fdae61','#d73027'];
function getColor(val, mode){
  const t = thresholds[mode];
  if (val <= t[0]) return colors[0];
  if (val <= t[1]) return colors[1];
  if (val <= t[2]) return colors[2];
  if (val <= t[3]) return colors[3];
  return colors[4];
}

// === 主要格網（POST 取回 GeoJSON；屬性：批發/零售/郵政/餐飲/供給） ===
let gridLayer = null;
let data = null;

fetch('./api/feature.php', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'feature=grid'
})
  .then(r => {
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
  })
  .then(json => {
    data = json;
    recompute();
    gridLayer = L.geoJSON(data, {
      style: f => ({
        color:'#2b2b2b',
        weight:0.2,
        fillOpacity:0.9,
        fillColor: getColor(f.properties[currentMode], currentMode)
      }),
      onEachFeature: (f, layer) => {
        layer.bindPopup(() => {
          const p = f.properties;
          return `
            <b>格網</b>：${p.Index ?? '-'}<br/>
            需求：${fmt(p.demand)}<br/>
            供給：${fmt(p.supply)}<br/>
            差額：${fmt(p.diff)}<br/>
            比率：${fmt(p.ratio)} %
          `;
        });
      }
    }).addTo(map);
    map.fitBounds(gridLayer.getBounds(), { padding:[20,20] });
    refreshLegend();
  })
  .catch(err => console.log('讀取格網失敗：', err));

// === 運算（依公式 + 時段權重） ===
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

    const S = supplyRaw * sW;

    p.demand = D;
    p.supply = S;
    p.diff   = S - D;
    p.ratio  = (S > 0) ? (D / S * 100) : 0;
  });

  recolor();
  refreshLegend();
}

// 重新著色
function recolor(){
  if(!gridLayer) return;
  gridLayer.eachLayer(l=>{
    const v = l.feature.properties[currentMode];
    l.setStyle({ fillColor: getColor(v, currentMode) });
  });
}

// 圖例
let legend = null;
function refreshLegend(){
  if(legend){ legend.remove(); legend = null; }
  legend = L.control({position:'topright'});
  legend.onAdd = ()=>{
    const div = L.DomUtil.create('div','legend');
    const t = thresholds[currentMode];
    const nm = { demand:'需求', supply:'供給', diff:'差額', ratio:'比率 (%)' }[currentMode];
    div.innerHTML = `<div class="title">${nm}</div>`;
    const segs = [`≤ ${t[0]}`, `${t[0]}–${t[1]}`, `${t[1]}–${t[2]}`, `${t[2]}–${t[3]}`, `> ${t[3]}`];
    div.innerHTML += segs.map((s,i)=>`<div><i style="background:${colors[i]}"></i>${s}</div>`).join('');
    return div;
  };
  legend.addTo(map);
}

function fmt(x){
  if (x===null || x===undefined || Number.isNaN(x)) return '-';
  const v = Number(x);
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 100) return v.toFixed(1);
  return v.toFixed(2);
}

// 額外圖層：卸貨車格（中心點）與 POI
let lotLayer = null;
let poiLayer = null;

function toggleLots(on){
  if (on && !lotLayer){
    fetch('./api/feature.php', {
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:'feature=lot-centroid'
    })
      .then(r=>r.json())
      .then(json=>{
        lotLayer = L.geoJSON(json, {
          pointToLayer: (f,latlng)=> L.circleMarker(latlng, {
            radius: 4, color:'#1f2937', weight:1, fillColor:'#60a5fa', fillOpacity:0.8
          }),
          onEachFeature: (f,l)=> l.bindTooltip(f.properties?.name || '卸貨車格', {permanent:false})
        }).addTo(map);
      })
      .catch(()=>{ alert('載入卸貨車格失敗'); chkLots.checked=false; });
  } else if(!on && lotLayer){
    map.removeLayer(lotLayer); lotLayer = null;
  }
}

function togglePOI(on){
  if (on && !poiLayer){
    fetch('./api/feature.php', {
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:'feature=poi'
    })
      .then(r=>r.json())
      .then(json=>{
        poiLayer = L.geoJSON(json, {
          pointToLayer: (f,latlng)=> L.circleMarker(latlng, {
            radius: 3.5, color:'#374151', weight:1, fillColor:'#f59e0b', fillOpacity:0.8
          }),
          onEachFeature: (f,l)=> l.bindTooltip(f.properties?.name || '商家', {permanent:false})
        }).addTo(map);
      })
      .catch(()=>{ alert('載入商家點位失敗'); chkPOI.checked=false; });
  } else if(!on && poiLayer){
    map.removeLayer(poiLayer); poiLayer = null;
  }
}
