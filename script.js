// --- 1. 設定常數與變數 ---

// TODO: 請務必將 YOUR_GOOGLE_SHEET_CSV_URL 替換成您自己的 Google Sheet CSV 發佈連結
const sheetUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSblwymnw2nYFMowZ3ldSzCHZSpJLTRqKVofaBpHEkIP6raSsQuC1ajGJEsQUaW2m2cplg-W2rTM-i-/pub?gid=0&single=true&output=csv'; 
const taiwanGeoJsonUrl = './taiwan.json'; // 讀取本地端的台灣地圖檔

// --- 2. 初始化 Leaflet 地圖 ---

// 設定地圖中心點在台灣，並設定初始縮放等級
const map = L.map('map').setView([23.97565, 120.9738819], 8);

// 更換為 CartoDB Positron (淺色極簡風格)
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
}).addTo(map);

// 建立一個變數來存放 GeoJSON 圖層，方便之後控制
let geoJsonLayer; 

// --- 3. 抓取資料並整合 ---

Promise.all([
    fetch(taiwanGeoJsonUrl).then(response => response.json()),
    fetch(sheetUrl).then(response => response.text())
]).then(([topoJsonData, csvData]) => {
    
    // 關鍵步驟：使用 topojson.feature 將 TopoJSON 轉換為 Leaflet 看得懂的 GeoJSON 格式
    const geoJsonData = topojson.feature(topoJsonData, topoJsonData.objects.map);

    // --- 3.1. 解析 CSV 並計算數據 ---
    const caseData = d3.csvParse(csvData);
    
    const aggregatedData = {}; // 用來儲存每個縣市的統計數據和案件列表
    
    // 初始化 aggregatedData，用地圖檔的縣市列表當作基礎
    geoJsonData.features.forEach(feature => {
        // 這個地圖檔的縣市名稱屬性是 'name'
        const countyName = feature.properties.name; 
        aggregatedData[countyName] = {
            total: 0,
            childAbuse: 0,
            juvenile: 0,
            cases: []
        };
    });

    // 遍歷從 Google Sheet 來的每一筆案件，並累加到 aggregatedData 中
    caseData.forEach(row => {
        const countyName = row.county ? row.county.trim() : undefined;
        // 檢查這個縣市是否存在於我們的地圖資料中
        if (aggregatedData[countyName]) {
            aggregatedData[countyName].total++;
            aggregatedData[countyName].cases.push(row);
            
            if (row.caseType === '虐童') {
                aggregatedData[countyName].childAbuse++;
            } else if (row.caseType === '少年案件') {
                aggregatedData[countyName].juvenile++;
            }
        }
    });

    // --- 3.2. 創建 GeoJSON 圖層並綁定數據與事件 ---
    geoJsonLayer = L.geoJSON(geoJsonData, {
        style: feature => style(feature, aggregatedData),
        onEachFeature: (feature, layer) => onEachFeature(feature, layer, aggregatedData)
    }).addTo(map);

}).catch(error => console.error('❌ 在抓取或處理資料的過程中發生嚴重錯誤:', error));


// --- 4. 輔助函式 ---

// 4.1. 根據案件數量決定縣市顏色
function getColor(count) {
    return count > 10 ? '#800026' :
           count > 5  ? '#BD0026' :
           count > 2  ? '#E31A1C' :
           count > 1  ? '#FC4E2A' :
           count > 0  ? '#FD8D3C' :
                        '#999999'; // 灰色代表無案件
}

// 4.2. 定義 GeoJSON 圖層的樣式
function style(feature, data) {
    // 確認使用 .name 來獲取縣市名稱
    const countyName = feature.properties.name;
    const countyData = data[countyName];
    const totalCases = countyData ? countyData.total : 0;

    return {
        fillColor: getColor(totalCases),
        weight: 2,
        opacity: 1,
        color: 'white',
        dashArray: '3',
        fillOpacity: 0.7
    };
}

// 4.3. 定義每個縣市的互動行為 (滑鼠移入、移出、點擊)
function onEachFeature(feature, layer, data) {
    // 確認使用 .name 來獲取縣市名稱
    const countyName = feature.properties.name;
    const countyData = data[countyName];

    // 建立提示框內容
    const tooltipContent = `
        <b>${countyName}</b><br>
        虐童案: ${countyData.childAbuse} 件<br>
        總計: ${countyData.total} 件
    `;
    layer.bindTooltip(tooltipContent, {
        sticky: true // 讓提示框跟隨滑鼠
    });

    // 設定滑鼠事件
    layer.on({
        mouseover: (e) => {
            const l = e.target;
            l.setStyle({
                weight: 4,
                color: '#666',
                dashArray: '',
                fillOpacity: 0.9
            });
        },
        mouseout: (e) => {
            geoJsonLayer.resetStyle(e.target); // 重設為原始樣式
        },
        click: (e) => {
            map.fitBounds(e.target.getBounds()); // 縮放至點擊的縣市
            updateDetailsPanel(countyName, countyData.cases); // 更新右側資訊面板
        }
    });
}

// 4.4. 更新右側詳細資訊面板的函式
function updateDetailsPanel(countyName, cases) {
    const panel = document.getElementById('details-panel');
    let titleHtml = `<h2>${countyName} - 案件列表 (${cases.length} 件)</h2>`;
    let cardsHtml = ''; // 專門用來存放卡片 HTML 的字串

    if (cases.length === 0) {
        cardsHtml = '<p style="padding: 0 20px;">此地區目前沒有記錄在案的案件。</p>';
    } else {
        cases.forEach(c => {
            // 根據案件類型給予不同的 class
            const typeClass = c.caseType === '少年案件' ? 'juvenile' : '';
            let newsLinkHtml = ''; // 先建立一個空字串
            if (c.newsLink && c.newsLink.trim() !== '') {
                newsLinkHtml = `
                    <span class="news-link">
                        <a href="${c.newsLink}" target="_blank" rel="noopener noreferrer">[新聞]</a>
                    </span>
                `;
            }

            // 將產生的卡片 HTML 累加到 cardsHtml
            cardsHtml += `
                <div class="case-card ${typeClass}">
                    <h4>
                    ${c.caseName || '無標題'} ${newsLinkHtml}
                    </h4> 
                    ${c.victimAge && c.victimAge.trim() !== '' ? `[年齡：${c.victimAge}]` : ''}
                    ${c.injury && c.injury.trim() !== '' ? `[孩童情況：${c.injury}]` : ''}
                    <p>${c.description || '無摘要'}</p>
                    <div class="date">${c.date || ''}</div>
                </div>
            `;
        });
    }

    // 最後，將標題和包裝好的卡片容器一起寫入面板
    panel.innerHTML = titleHtml + `<div class="cases-container">${cardsHtml}</div>`;
}
