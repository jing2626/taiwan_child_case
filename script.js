// Taiwan Child Protection Cases Map - Enhanced Version
// ===================================================

class TaiwanCasesMap {
    constructor() {
        // Configuration
        this.config = {
            sheetUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSblwymnw2nYFMowZ3ldSzCHZSpJLTRqKVofaBpHEkIP6raSsQuC1ajGJEsQUaW2m2cplg-W2rTM-i-/pub?gid=0&single=true&output=csv',
            taiwanGeoJsonUrl: './taiwan.json',
            mapCenter: [23.97565, 120.9738819],
            mapZoom: 8,
            retryAttempts: 3,
            retryDelay: 2000
        };

        // State
        this.state = {
            map: null,
            geoJsonLayer: null,
            aggregatedData: {},
            allCases: [],
            currentCounty: null,
            filteredCases: [],
            isLoading: true,
            searchTerm: '',
            caseTypeFilter: 'all',
            sortOrder: 'date-desc'
        };

        // DOM Elements
        this.elements = {
            loadingScreen: document.getElementById('loading-screen'),
            app: document.getElementById('app'),
            map: document.getElementById('map'),
            panelTitle: document.getElementById('panel-title'),
            panelStats: document.getElementById('panel-stats'),
            totalCases: document.getElementById('total-cases'),
            abuseCases: document.getElementById('abuse-cases'),
            juvenileCases: document.getElementById('juvenile-cases'),
            casesList: document.getElementById('cases-list'),
            searchInput: document.getElementById('search-input'),
            caseTypeFilter: document.getElementById('case-type-filter'),
            sortOrder: document.getElementById('sort-order'),
            resetViewBtn: document.getElementById('reset-view'),
            fullscreenBtn: document.getElementById('fullscreen-toggle'),
            errorModal: document.getElementById('error-modal'),
            errorMessage: document.getElementById('error-message'),
            errorRetryBtn: document.getElementById('error-retry'),
            errorCloseBtn: document.getElementById('error-modal-close'),
            totalCounties: document.getElementById('total-counties'),
            totalAllCases: document.getElementById('total-all-cases'),
            totalAbuseCases: document.getElementById('total-abuse-cases'),
            totalJuvenileCases: document.getElementById('total-juvenile-cases')
        };

        this.init();
    }

    async init() {
        try {
            this.showLoading();
            this.initializeMap();
            this.bindEvents();
            await this.loadData();
            this.hideLoading();
        } catch (error) {
            console.error('Initialization failed:', error);
            this.showError('初始化失敗，請重新載入頁面。');
        }
    }

    showLoading() {
        this.elements.loadingScreen.classList.remove('hidden');
        this.elements.app.classList.add('hidden');
    }

    hideLoading() {
        setTimeout(() => {
            this.elements.loadingScreen.classList.add('hidden');
            this.elements.app.classList.remove('hidden');
        }, 500);
    }

    initializeMap() {
        // Initialize Leaflet map with dark theme
        this.state.map = L.map(this.elements.map, {
            center: this.config.mapCenter,
            zoom: this.config.mapZoom,
            zoomControl: false,
            attributionControl: true
        });

        // Add custom zoom control
        L.control.zoom({
            position: 'bottomright'
        }).addTo(this.state.map);

        // Use dark theme tile layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(this.state.map);

        // Disable map interactions during loading
        this.state.map.dragging.disable();
        this.state.map.touchZoom.disable();
        this.state.map.doubleClickZoom.disable();
        this.state.map.scrollWheelZoom.disable();
        this.state.map.boxZoom.disable();
        this.state.map.keyboard.disable();
    }

    bindEvents() {
        // Search functionality
        this.elements.searchInput.addEventListener('input', this.debounce((e) => {
            this.state.searchTerm = e.target.value.toLowerCase();
            this.filterAndDisplayCases();
        }, 300));

        // Filter controls
        this.elements.caseTypeFilter.addEventListener('change', (e) => {
            this.state.caseTypeFilter = e.target.value;
            this.filterAndDisplayCases();
        });

        this.elements.sortOrder.addEventListener('change', (e) => {
            this.state.sortOrder = e.target.value;
            this.filterAndDisplayCases();
        });

        // Map controls
        this.elements.resetViewBtn.addEventListener('click', () => {
            this.state.map.setView(this.config.mapCenter, this.config.mapZoom);
        });

        this.elements.fullscreenBtn.addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // Error modal
        this.elements.errorCloseBtn.addEventListener('click', () => {
            this.hideError();
        });

        this.elements.errorRetryBtn.addEventListener('click', () => {
            this.hideError();
            this.init();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideError();
            }
            if (e.key === 'f' && e.ctrlKey) {
                e.preventDefault();
                this.elements.searchInput.focus();
            }
        });
    }

    async loadData() {
        let attempts = 0;
        
        while (attempts < this.config.retryAttempts) {
            try {
                const [geoJsonData, csvData] = await Promise.all([
                    this.fetchWithRetry(this.config.taiwanGeoJsonUrl),
                    this.fetchWithRetry(this.config.sheetUrl, 'text')
                ]);

                this.processData(geoJsonData, csvData);
                this.enableMapInteractions();
                return;
            } catch (error) {
                attempts++;
                console.error(`Load attempt ${attempts} failed:`, error);
                
                if (attempts < this.config.retryAttempts) {
                    await this.delay(this.config.retryDelay);
                } else {
                    throw new Error('無法載入資料，請檢查網路連線。');
                }
            }
        }
    }

    async fetchWithRetry(url, responseType = 'json') {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return responseType === 'json' ? response.json() : response.text();
    }

    processData(topoJsonData, csvData) {
        // Convert TopoJSON to GeoJSON
        const geoJsonData = topojson.feature(topoJsonData, topoJsonData.objects.map);
        
        // Parse CSV data
        const caseData = d3.csvParse(csvData);
        this.state.allCases = caseData;

        // Initialize aggregated data
        this.state.aggregatedData = {};
        geoJsonData.features.forEach(feature => {
            const countyName = feature.properties.name;
            this.state.aggregatedData[countyName] = {
                total: 0,
                childAbuse: 0,
                juvenile: 0,
                cases: []
            };
        });

        // Aggregate case data by county
        caseData.forEach(row => {
            const countyName = row.county ? row.county.trim() : undefined;
            if (this.state.aggregatedData[countyName]) {
                this.state.aggregatedData[countyName].total++;
                this.state.aggregatedData[countyName].cases.push(row);
                
                if (row.caseType === '虐童') {
                    this.state.aggregatedData[countyName].childAbuse++;
                } else if (row.caseType === '少年案件') {
                    this.state.aggregatedData[countyName].juvenile++;
                }
            }
        });

        // Create GeoJSON layer
        this.state.geoJsonLayer = L.geoJSON(geoJsonData, {
            style: (feature) => this.getCountyStyle(feature),
            onEachFeature: (feature, layer) => this.bindCountyEvents(feature, layer)
        }).addTo(this.state.map);

        // Update global statistics
        this.updateGlobalStats();
    }

    getCountyStyle(feature) {
        const countyName = feature.properties.name;
        const countyData = this.state.aggregatedData[countyName];
        const totalCases = countyData ? countyData.total : 0;

        return {
            fillColor: this.getCaseCountColor(totalCases),
            weight: 2,
            opacity: 1,
            color: '#6b7280',
            dashArray: '3',
            fillOpacity: 0.8,
            transition: 'all 0.3s ease'
        };
    }

    getCaseCountColor(count) {
        if (count > 10) return '#991b1b';
        if (count > 5) return '#dc2626';
        if (count > 2) return '#f97316';
        if (count > 0) return '#fbbf24';
        return '#374151';
    }

    bindCountyEvents(feature, layer) {
        const countyName = feature.properties.name;
        const countyData = this.state.aggregatedData[countyName];

        // Create tooltip
        const tooltipContent = `
            <div class="map-tooltip">
                <strong>${countyName}</strong><br>
                <span style="color: #ef4444;">虐童案: ${countyData.childAbuse} 件</span><br>
                <span style="color: #06b6d4;">少年案件: ${countyData.juvenile} 件</span><br>
                <strong>總計: ${countyData.total} 件</strong>
            </div>
        `;
        
        layer.bindTooltip(tooltipContent, {
            sticky: true,
            className: 'custom-tooltip'
        });

        // Bind events
        layer.on({
            mouseover: (e) => this.onCountyMouseOver(e),
            mouseout: (e) => this.onCountyMouseOut(e),
            click: (e) => this.onCountyClick(e, countyName, countyData.cases)
        });
    }

    onCountyMouseOver(e) {
        const layer = e.target;
        layer.setStyle({
            weight: 4,
            color: '#4f46e5',
            dashArray: '',
            fillOpacity: 0.9
        });
        layer.bringToFront();
    }

    onCountyMouseOut(e) {
        this.state.geoJsonLayer.resetStyle(e.target);
    }

    onCountyClick(e, countyName, cases) {
        // Fit map to county bounds
        this.state.map.fitBounds(e.target.getBounds(), {
            padding: [20, 20]
        });

        // Update info panel
        this.state.currentCounty = countyName;
        this.state.filteredCases = cases;
        this.updateInfoPanel(countyName, cases);
        this.filterAndDisplayCases();
    }

    updateInfoPanel(countyName, cases) {
        // Update title
        this.elements.panelTitle.textContent = `${countyName} - 案件詳情`;

        // Calculate statistics
        const totalCases = cases.length;
        const abuseCases = cases.filter(c => c.caseType === '虐童').length;
        const juvenileCases = cases.filter(c => c.caseType === '少年案件').length;

        // Update statistics
        this.elements.totalCases.textContent = totalCases;
        this.elements.abuseCases.textContent = abuseCases;
        this.elements.juvenileCases.textContent = juvenileCases;

        // Show stats panel
        this.elements.panelStats.style.display = 'grid';
    }

    filterAndDisplayCases() {
        if (!this.state.currentCounty || !this.state.filteredCases) {
            this.showEmptyState();
            return;
        }

        let filteredCases = [...this.state.filteredCases];

        // Apply case type filter
        if (this.state.caseTypeFilter !== 'all') {
            filteredCases = filteredCases.filter(c => c.caseType === this.state.caseTypeFilter);
        }

        // Apply search filter
        if (this.state.searchTerm) {
            filteredCases = filteredCases.filter(c => 
                (c.caseName && c.caseName.toLowerCase().includes(this.state.searchTerm)) ||
                (c.description && c.description.toLowerCase().includes(this.state.searchTerm)) ||
                (c.victimAge && c.victimAge.toLowerCase().includes(this.state.searchTerm))
            );
        }

        // Apply sorting
        filteredCases.sort((a, b) => {
            switch (this.state.sortOrder) {
                case 'date-desc':
                    return new Date(b.date || 0) - new Date(a.date || 0);
                case 'date-asc':
                    return new Date(a.date || 0) - new Date(b.date || 0);
                case 'name':
                    return (a.caseName || '').localeCompare(b.caseName || '');
                default:
                    return 0;
            }
        });

        this.displayCases(filteredCases);
    }

    displayCases(cases) {
        if (cases.length === 0) {
            this.showNoResultsState();
            return;
        }

        const casesHtml = cases.map(caseData => this.createCaseCard(caseData)).join('');
        this.elements.casesList.innerHTML = casesHtml;
    }

    createCaseCard(caseData) {
        const typeClass = caseData.caseType === '少年案件' ? 'juvenile' : '';
        const ageDisplay = caseData.victimAge && caseData.victimAge.trim() !== '' 
            ? `<div class="case-age">年齡：${caseData.victimAge}</div>` 
            : '';
        
        const newsLinkHtml = caseData.newsLink && caseData.newsLink.trim() !== '' 
            ? `<div class="case-link">
                 <a href="${caseData.newsLink}" target="_blank" rel="noopener noreferrer">
                   📰 相關新聞
                 </a>
               </div>` 
            : '';

        return `
            <div class="case-card ${typeClass}">
                <h4 class="case-title">${caseData.caseName || '無標題'}</h4>
                <div class="case-subtitle">[${caseData.caseType || '無分類'}]</div>
                ${ageDisplay}
                <div class="case-description">${caseData.description || '無摘要'}</div>
                <div class="case-footer">
                    <div class="case-date">${this.formatDate(caseData.date)}</div>
                </div>
                ${newsLinkHtml}
            </div>
        `;
    }

    showEmptyState() {
        this.elements.casesList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📍</div>
                <h3>請點擊地圖上的縣市</h3>
                <p>選擇任一縣市來查看該地區的兒少案件詳細資訊</p>
            </div>
        `;
        this.elements.panelStats.style.display = 'none';
        this.elements.panelTitle.textContent = '選擇縣市查看詳細資訊';
    }

    showNoResultsState() {
        this.elements.casesList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔍</div>
                <h3>沒有找到符合條件的案件</h3>
                <p>請嘗試調整搜尋條件或篩選設定</p>
            </div>
        `;
    }

    updateGlobalStats() {
        const totalCases = this.state.allCases.length;
        const abuseCases = this.state.allCases.filter(c => c.caseType === '虐童').length;
        const juvenileCases = this.state.allCases.filter(c => c.caseType === '少年案件').length;

        this.elements.totalAllCases.textContent = totalCases;
        this.elements.totalAbuseCases.textContent = abuseCases;
        this.elements.totalJuvenileCases.textContent = juvenileCases;
    }

    enableMapInteractions() {
        this.state.map.dragging.enable();
        this.state.map.touchZoom.enable();
        this.state.map.doubleClickZoom.enable();
        this.state.map.scrollWheelZoom.enable();
        this.state.map.boxZoom.enable();
        this.state.map.keyboard.enable();
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error('Error attempting to enable fullscreen:', err);
            });
        } else {
            document.exitFullscreen();
        }
    }

    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorModal.classList.remove('hidden');
    }

    hideError() {
        this.elements.errorModal.classList.add('hidden');
    }

    formatDate(dateString) {
        if (!dateString) return '日期未知';
        
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('zh-TW', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
        } catch (error) {
            return dateString;
        }
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.taiwanCasesMap = new TaiwanCasesMap();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && window.taiwanCasesMap) {
        // Refresh map size when page becomes visible
        setTimeout(() => {
            if (window.taiwanCasesMap.state.map) {
                window.taiwanCasesMap.state.map.invalidateSize();
            }
        }, 100);
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    if (window.taiwanCasesMap && window.taiwanCasesMap.state.map) {
        setTimeout(() => {
            window.taiwanCasesMap.state.map.invalidateSize();
        }, 100);
    }
});

// Service Worker removed to avoid 404 errors in development

