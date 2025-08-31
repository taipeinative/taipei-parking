# Taipei-Parking

臺北市路邊卸貨停車格供需分析暨搜尋系統。

## 指令行介面

### 北市好停車爬蟲

前往[北市好停車](https://itaipeiparking.pma.gov.taipei/)收集即時路邊停車位資訊的自動化程式，發送請求的最小間距為 0.5 秒。\
Python 環境內需安裝：

* [Python](https://www.python.org/downloads/) - *3.11+*
* [Beautiful Soup](https://pypi.org/project/beautifulsoup4/)
* [Pandas](https://pypi.org/project/pandas/)
* [Requests](https://pypi.org/project/requests/)
* [Shapely](https://pypi.org/project/shapely/)

```shell
python script/crawler.py
```

輸出的 GeoJSON 檔案名格式為 `WW-HH-MM-SS (YY-mm-DD).geojson`，其中 `WW` 為由 1（星期一）至 7（星期日）的日期。每個圖徵包含以下欄位：

* `id`—停車位編號
* `name`—停車位名稱
* `service`—服務時間
* `timestamp`—時間戳
* `toll`—收費標準
* `occupied`—停車位是否被占用？
