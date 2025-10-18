// === 地圖（乾淨底圖：Carto Light 無標註） ===
const map = L.map('map').setView([25.04, 121.55], 12);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

// === 狀態 ===
let currentMode = 'demand'; // demand | supply | diff | ratio
let currentTime = 'm';      // m | a | e
let addMode = false;        // 新增車格模式

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
const chkGrid = document.getElementById('chkGrid'); // 若 HTML 尚未加入，可忽略或加上對應 checkbox
const chkLots = document.getElementById('chkLots');
const chkPOI  = document.getElementById('chkPOI');

if (chkGrid) chkGrid.addEventListener('change', ()=>setGridVisible(chkGrid.checked));
if (chkLots) chkLots.addEventListener('change', ()=>toggleLots(chkLots.checked));
if (chkPOI)  chkPOI .addEventListener('change', ()=>togglePOI (chkPOI .checked));

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
document.getElementById('supply_weight').addEventListener('input', ()=>{ recompute(); });

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

    // 初始化使用者相關欄位
    data.features.forEach(f => {
      f.properties.userFrac   = 0; // 面積比例加總（∈[0,1]，可能小於1若 buffer 有部分落在格網外）
      f.properties.userSupply = 0; // 未加權供給（= userFrac × 8 小時）
      f.properties.userCount  = 0; // 參考：有幾個點的 buffer 有打到此格（非必要，僅顯示）
    });

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
          const sW = W('supply_weight');
          const frac = p.userFrac || 0;
          return `
            <b>格網</b>：${p.Index ?? '-'}<br/>
            需求：${fmt(p.demand)}<br/>
            供給：${fmt(p.supply)}<br/>
            <small>＝(原始供給 ${fmt(p['供給']||0)} + 使用者 ${fmt(frac)}×8) × 權重 ${fmt(sW)}</small><br/>
            使用者 buffer 覆蓋比例：${fmt(frac)}，使用者供給（未加權）：${fmt(p.userSupply||0)}<br/>
            差額：${fmt(p.diff)}<br/>
            比率：${fmt(p.ratio)} %
          `;
        });
      }
    }).addTo(map);
    map.fitBounds(gridLayer.getBounds(), { padding:[20,20] });
    refreshLegend();

    // 載入本地儲存的點
    restoreUserLots();
  })
  .catch(err => console.log('讀取格網失敗：', err));

// 顯示/隱藏格網（若有 chkGrid）
function setGridVisible(on){
  if (on) {
    if (!gridLayer && data) {
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
            const sW = W('supply_weight');
            const frac = p.userFrac || 0;
            return `
              <b>格網</b>：${p.Index ?? '-'}<br/>
              需求：${fmt(p.demand)}<br/>
              供給：${fmt(p.supply)}<br/>
              <small>＝(原始供給 ${fmt(p['供給']||0)} + 使用者 ${fmt(frac)}×8) × 權重 ${fmt(sW)}</small><br/>
              使用者 buffer 覆蓋比例：${fmt(frac)}，使用者供給（未加權）：${fmt(p.userSupply||0)}<br/>
              差額：${fmt(p.diff)}<br/>
              比率：${fmt(p.ratio)} %
            `;
          });
        }
      }).addTo(map);
      recolor();
    } else if (gridLayer && !map.hasLayer(gridLayer)) {
      gridLayer.addTo(map);
      recolor();
    }
    refreshLegend();
  } else {
    if (gridLayer && map.hasLayer(gridLayer)) {
      map.removeLayer(gridLayer);
    }
    if (legend) { legend.remove(); legend = null; }
  }
}

// === 運算（依公式 + 時段權重 + 使用者新增點） ===
// 公式：S = (供給 + userFrac × 8) × 供給權重
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

    // 需求（依所選時段的權重）
    const D =
      wholesale * W('wholesale'+suf) +
      retail    * W('retail'   +suf) +
      food      * W('food'     +suf) +
      post      * W('post'     +suf);

    // 使用者供給（未加權）：= userFrac × 8
    const userSupply = (p.userFrac || 0) * 8;

    // 供給（避免雙重加權）：(原始供給 + 使用者未加權供給) × 供給權重
    const S = (supplyRaw + userSupply) * sW;

    p.demand = D;
    p.supply = S;
    p.userSupply = userSupply;
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

/* -------------------------
   使用者新增車格點 (可拖曳/右鍵刪)
------------------------- */
let userLotsLayer = L.layerGroup().addTo(map);
let userLots = []; // { id, marker }
const btnAddLots   = document.getElementById('btnAddLots');
const btnClearLots = document.getElementById('btnClearLots');

btnAddLots.addEventListener('click', ()=>{
  addMode = !addMode;

  // 1) 視覺（深色底＋白字，樣式在 CSS）
  btnAddLots.classList.toggle('active', addMode);
  btnAddLots.textContent = addMode
    ? '🖱 點地圖以新增（再次點此退出）'
    : '➕ 新增車格';

  // 2) 讓地圖點擊穿透向量圖層（避免格網攔截）
  map.getContainer().classList.toggle('adding-lots', addMode);

  // 3) 關閉既有 popup
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
  const marker = L.marker(latlng, { draggable:true, opacity:0.95 });
  marker.bindTooltip(`新增的車格（右鍵刪除，拖曳可移動）`, {permanent:false});
  marker.on('dragend', ()=>{ updateUserSupplyFromPoints(); recompute(); });
  marker.on('contextmenu', ()=>{
    // 右鍵刪除
    userLots = userLots.filter(pt => pt.marker !== marker);
    userLotsLayer.removeLayer(marker);
    saveUserLots();
    updateUserSupplyFromPoints();
    recompute();
  });
  return marker;
}

function genId(){ return Math.random().toString(36).slice(2,10); }

// 將使用者點分配到格網（用 Turf：50m buffer ∩ 各格網，依面積比例分配）
// 將「比例」加總到 userFrac，之後在 recompute() 轉成 ×8 小時，再乘供給權重
function updateUserSupplyFromPoints(){
  if (!data) return;

  // 歸零
  data.features.forEach(f => {
    f.properties.userFrac   = 0; // 面積比例合計
    f.properties.userSupply = 0; // 未加權供給（顯示用）
    f.properties.userCount  = 0; // 有命中的點數（參考）
  });

  if (userLots.length === 0) return;

  // 將每個點 50m buffer，比例分配到所有有交集的格網
  userLots.forEach(pt=>{
    const ll = pt.marker.getLatLng();
    const ptTurf = turf.point([ll.lng, ll.lat]);
    const buf = turf.buffer(ptTurf, 50, { units: 'meters' });
    const bufArea = turf.area(buf);
    if (!bufArea || bufArea <= 0) return;

    data.features.forEach(f=>{
      const poly = f.geometry; // Polygon/MultiPolygon
      if (!poly) return;
      // 計算交集
      const inter = turf.intersect(buf, poly);
      if (inter){
        const interArea = turf.area(inter);
        if (interArea > 0){
          const frac = interArea / bufArea; // 該點分配到這個格的比例
          f.properties.userFrac += frac;
          f.properties.userCount += 1; // 記錄有被此點影響（統計用途）
        }
      }
    });
  });

  // 顯示用：未加權的使用者供給 = 比例 × 8（時段長度）
  data.features.forEach(f => {
    f.properties.userSupply = (f.properties.userFrac || 0) * 8;
  });
}

// 本地儲存：保留點位
function saveUserLots(){
  const arr = userLots.map(pt=>{
    const ll = pt.marker.getLatLng();
    return { id: pt.id, lat: ll.lat, lng: ll.lng };
  });
  localStorage.setItem('userLots', JSON.stringify(arr));
}

function restoreUserLots(){
  const raw = localStorage.getItem('userLots');
  if (!raw) return;
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

/* 額外資料圖層（API） */
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
      .catch(()=>{ alert('載入卸貨車格失敗'); if (chkLots) chkLots.checked=false; });
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
      .catch(()=>{ alert('載入商家點位失敗'); if (chkPOI) chkPOI.checked=false; });
  } else if(!on && poiLayer){
    map.removeLayer(poiLayer); poiLayer = null;
  }
}
