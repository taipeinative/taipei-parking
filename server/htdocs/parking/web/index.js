const APIKEY = 'gXAfGuwbRueOGQvJ5wEm'

/**
 * 管理擷取資訊的類別。
 */
class Fetch {
    /**
     * @var {string} logLevel 輸出日誌的等級。
     */
    static logLevel = 'Info';

    /**
     * 擷取指定圖徵的方法。
     * @param {string} id 資源的名稱。 
     */
    static async features(id) {
        try {
            const formData = new FormData();
            formData.append('feature', id);

            const response = await fetch('./api/feature.php', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const features = await response.json();
            return features;

        } catch (err) {
            console.error('Failed to fetch features:', err);
        }
    }
}

/**
 * 管理互動式地圖的類別。
 */
class MapService {
    /**
     * @var {Array<any>} controls 儲存地圖控制項目的欄位。
     */
    controls = [];

    /**
     * @var {ol.interaction} 管理使用者互動的把柄（Handle）。
     */
    interaction;

    /**
     * @var {Array<any>} layers 儲存圖層的欄位。
     */
    layers = [];

    /**
     * @var {ol.Map} map 儲存地圖的欄位。
     */
    map;

    /**
     * @var {string} ref 儲存參考對象名稱的欄位。
     */
    ref = 'map';

    /**
     * @var {ol.View} view 儲存視角的欄位。
     */
    view;

    /**
     * 建立互動式地圖的建構函式。
     * @param {string} ref 地圖將置入的對象名稱。
     */
    constructor(ref) {
        if (ref != null) {
            this.ref = ref;
            this.view = new ol.View({
                center: ol.proj.fromLonLat([121.545, 25.04]),
                maxZoom: 18.5,
                minZoom: 2.5,
                zoom: 10
            });
        }
    }

    /**
     * 將地圖添加至指定對象。
     * @param {ol.View} view 視角設定，可選參數。
     * @returns {MapService} 若有需要，此方法將回傳自身。
     */
    addToRef(view = this.view) {
        this.map = new ol.Map({
            controls: this.controls,
            layers: this.layers,
            view: view,
            target: this.ref
        });
        return this;
    }

    /**
     * 獲得指定的圖層。
     * @param {string} id 圖層的代號。接受的值：`POI`－興趣點位、`OSM`－OpenStreetMap。
     * @param {boolean} addInPlace 是否直接加入圖層？可選參數。
     * @param {object} options 額外的圖層設定，可選參數。
     * @returns {ol.layer | null} 指定的圖層，或是不回傳東西。
     */
    async getLayer(id, addInPlace = false, options = {}) {
        let val;
        let layer;
        const layerId = `layer${id}`;
        switch (id) {
            // 200m 網格
            case 'GRID':
                val = await Fetch.features('grid');
                layer = new ol.layer.Vector({
                    id: layerId,
                    source: new ol.source.Vector({
                        features: new ol.format.GeoJSON().readFeatures(val, {
                            dataProjection: 'EPSG:4326',
                            featureProjection: 'EPSG:3857'
                        })
                    }),
                    style: this.getStyle('grid'),
                    type: 'overlay'
                });
                break;

            // 卸貨車位
            case 'LOT-CENTROID':
                val = await Fetch.features('lot-centroid');
                layer = new ol.layer.Vector({
                    id: layerId,
                    maxZoom: 16.99,
                    minZoom: 13,
                    source: new ol.source.Vector({
                        features: new ol.format.GeoJSON().readFeatures(val, {
                            dataProjection: 'EPSG:4326',
                            featureProjection: 'EPSG:3857'
                        })
                    }),
                    style: this.getStyle('lot-centroid'),
                    type: 'overlay'
                });
                break;

            case 'LOT-POLYGON':
                val = await Fetch.features('lot-polygon');
                layer = new ol.layer.Vector({
                    id: layerId,
                    minZoom: 17,
                    source: new ol.source.Vector({
                        features: new ol.format.GeoJSON().readFeatures(val, {
                            dataProjection: 'EPSG:4326',
                            featureProjection: 'EPSG:3857'
                        })
                    }),
                    style: this.getStyle('lot-polygon'),
                    type: 'overlay'
                });
                break;

            // MapTiler
            case 'MAPTILER':
                if (!options.key) throw new Error('MapTiler API key is required.');
                const styleId = options.style || 'streets-v2';
                layer = new ol.layer.Tile({
                    id: layerId,
                    source: new ol.source.XYZ({
                        url: `./tiles/proxy.php?style=${styleId}&z={z}&x={x}&y={y}`,
                        tileSize: 512,
                        crossOrigin: 'anonymous'
                    }),
                    type: 'base'
                });
                break;

            // OpenStreetMap
            case 'OSM':
                layer = new ol.layer.Tile({
                    id: layerId,
                    source: new ol.source.OSM(),
                    type: 'base'
                });
                break;

            // 興趣點位
            case 'POI':
                val = await Fetch.features('poi');
                layer = new ol.layer.Vector({
                    id: layerId,
                    minZoom: 15.5,
                    source: new ol.source.Vector({
                        features: new ol.format.GeoJSON().readFeatures(val, {
                            dataProjection: 'EPSG:4326',
                            featureProjection: 'EPSG:3857'
                        })
                    }),
                    style: this.getStyle('poi'),
                    type: 'overlay'
                });
                break;

            default:
                throw new Error('Invalid layer id');
        }

        // 額外屬性設定
        layer.setProperties(options, true);

        if (addInPlace) {
            this.layers.push(layer);
        }

        return Promise.resolve(layer);
    }

    /**
     * 獲得指定圖層的樣式名稱。
     * @param {string} name 樣式的名稱。
     */
    getStyle(name) {
        switch (name) {
            case 'grid':
                return (feature) => {
                    const weights = collectTableData();
                    const timeKey = getCurrentTime();
                    const props = feature.getProperties();
                    const supplyWeight = parseFloat(document.getElementById('supply')?.value || 1);

                    let weightedSum = 0;
                    for (const id in weights) {
                        const w = weights[id][timeKey] ?? 0;
                        const val = props[id] ?? 0;
                        weightedSum += val * w;
                    }

                    const supply = props['Supply'] ?? 0;
                    const diff = (supply * supplyWeight) - weightedSum;

                    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

                    // default white
                    let r = 255, g = 255, b = 255;
                    const alpha = 0.4;

                    if (diff > 0) {
                        // positive (surplus): white → green
                        const t = clamp(diff / 50, 0, 1);
                        r = 255 - Math.round(255 * t);
                        g = 255;
                        b = 255 - Math.round(255 * t);
                    } else if (diff < 0) {
                        // negative (deficit): white → red
                        const t = clamp(-diff / 50, 0, 1);
                        r = 255;
                        g = 255 - Math.round(255 * t);
                        b = 255 - Math.round(255 * t);
                    }

                    const fillColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;

                    return new ol.style.Style({
                        fill: new ol.style.Fill({ color: fillColor }),
                        stroke: new ol.style.Stroke({
                            color: '#444',
                            width: 0.75
                        }),
                        zIndex: 7
                    });
                };

            case 'lot-centroid':
                return new ol.style.Style({
                        image: new ol.style.Circle({
                            fill: new ol.style.Fill({color: '#24ac73'}),
                            radius: 4,
                            stroke: new ol.style.Stroke({
                                color: '#F0F0F0',
                                width: 1
                            })
                        }),
                        zIndex: 5
                    });

            case 'lot-polygon':
                return new ol.style.Style({
                    fill: new ol.style.Fill({color: '#29db91'}),
                    stroke: new ol.style.Stroke({
                        color: '#FDFDFD',
                        width: 2
                    }),
                    zIndex: 3
                });

            case 'poi':
                return new ol.style.Style({
                    image: new ol.style.Circle({
                        fill: new ol.style.Fill({color: '#a929db'}),
                        radius: 2,
                        stroke: new ol.style.Stroke({
                            color: '#F0F0F0',
                            width: 1
                        })
                    }),
                    zIndex: 1
                });

            default:
                throw new Error('Invalid name.');
        }
    }

    /**
     * 將地圖從指定對象中移除。
     * @returns {MapService} 若有需要，此方法將回傳自身。
     */
    removeFromRef() {
        this.map.setTarget(null);
        return this;
    }

    /**
     * 設定圖層順序。
     * @param {string} layerId 圖層名稱。
     * @param {number} zIndex 圖層的順位。
     */
    setLayerOrder(layerId, zIndex) {
        const layer = this.layers.find(l => l.get('id') === layerId);
        if (layer) layer.setZIndex(zIndex);
    }

    /**
     * 設定新的地圖容器。
     * @param {string} ref 指定對象。
     * @returns {MapService} 若有需要，此方法將回傳自身。
     */
    setRef(ref) {
        this.ref = ref;
        return this;
    }

    /**
     * 切換基本圖層。
     * @param {string} layerId 圖層的代號。
     */
    switchBaseLayer(layerId) {
        this.layers.forEach(layer => {
            if (layer.get('type') == 'base') {
                const id = layer.get('id');
                if (id) {
                    layer.setVisible(id === layerId);
                }
            }
        });
    }

    /**
     * 切換套疊圖層。
     * @param {string} layerId 圖層的代號。
     */
    toggleOverlayLayer(layerId) {
        this.layers.forEach(layer => {
            if (layer.get('type') == 'overlay') {
                const id = layer.get('id');
                if (id === layerId) {
                    layer.setVisible(!layer.getVisible());
                    return;
                }
            }
        });
    }
}

/**
 * @var {MapService} mapService 儲存地圖服務的物件。
 */
let mapService = new MapService();

const collectTableData = () => {
    const data = {};
    document.querySelectorAll("input[type='number']").forEach(input => {
      const [id, time] = input.id.split("_");
      if (!data[id]) data[id] = {};
      data[id][time] = parseFloat(input.value);
    });
    return data;
}

const getCurrentTime = () => {
  const sel = document.querySelector(".time-option.selected");
  return sel ? sel.dataset.time : 'morning';
};

/**
 * 初始化的函式。
 */
const initialize = async () => {
    // 設定初始位置。
    mapService.view.setCenter(ol.proj.fromLonLat([121.545, 25.04]));
    mapService.view.setZoom(14);

    // 加入基本圖層。
    await mapService.getLayer('MAPTILER', true, {key: APIKEY, style: 'dataviz'});

    // 加入套疊圖層。
    await mapService.getLayer('GRID', true, { zIndex: 0 });
    await mapService.getLayer('LOT-CENTROID', true, { zIndex: 2 });
    await mapService.getLayer('LOT-POLYGON', true, { zIndex: 2 });
    await mapService.getLayer('POI', true, { zIndex: 1 });

    // 設定參照對象並渲染地圖。
    mapService.setRef('map').addToRef();
}

const supplyHandler = () => {
    document.getElementById("supply").addEventListener("input", refreshGridLayer);
}

const tableHandler = () => {
    // 可折疊的標題
    document.querySelectorAll(".group-header").forEach(header => {
        header.addEventListener("click", () => {
        const group = header.dataset.group;
        const rows = document.querySelectorAll(`tr[data-group='${group}']:not(.group-header)`);
        const icon = header.querySelector(".collapse-icon");
        const hidden = rows[0].classList.contains("hidden-row");
        rows.forEach(r => r.classList.toggle("hidden-row"));
        icon.textContent = hidden ? "▼" : "►";
        });
    });

    // 驗證輸入值
    document.querySelectorAll("input[type='number']").forEach(input => {
        input.addEventListener("input", e => {
            const val = parseFloat(e.target.value);
            if (val < 0) {
                alert(`⚠️ 負數警告：欄位 ${e.target.id} 的值不可為負數！`);
                e.target.value = 0;
            }
            refreshGridLayer();
        });
    });
}

const timeSelectorHandler = () => {
    const container = document.getElementById("timeSelector");
    container.querySelectorAll(".time-option").forEach(opt => {
            opt.addEventListener("click", () => {
            container.querySelectorAll(".time-option").forEach(o => o.classList.remove("selected"));
            opt.classList.add("selected");
            refreshGridLayer();
        });
    });
}

const refreshGridLayer = () => {
  mapService.layers
    .filter(l => l.get('id') === 'layerGRID')
    .forEach(l => l.changed());
};

// 前端腳本入口點
window.addEventListener('load', () => {
    mapService = new MapService('map');
    initialize();
    supplyHandler();
    tableHandler();
    timeSelectorHandler();
});