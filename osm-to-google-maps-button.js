// ==UserScript==
// @name         OSM to Google Maps Button
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Fügt einen Google-Maps-Link zu OSM-Suchergebnissen und dem Kartenmenü hinzu
// @author       ChatGPT
// @match        https://www.openstreetmap.org/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=openstreetmap.org
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let contextMenuLat = null;
    let contextMenuLon = null;
    let leafletReady = false;

    function setCoords(lat, lon, source = '') {
        const latNum = Number(lat);
        const lonNum = Number(lon);

        if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
            return false;
        }

        contextMenuLat = latNum.toFixed(6);
        contextMenuLon = lonNum.toFixed(6);

        if (source) {
            console.log(`✓ Koordinaten gesetzt (${source}):`, contextMenuLat, contextMenuLon);
        }

        updateMenuLinkHref();
        return true;
    }

    function getGoogleMapsUrl() {
        if (!contextMenuLat || !contextMenuLon) {
            return null;
        }
        return `https://www.google.com/maps/search/?api=1&query=${contextMenuLat},${contextMenuLon}`;
    }

    function getMapCenterCoords() {
        try {
            if (window.map && typeof window.map.getCenter === 'function') {
                const center = window.map.getCenter();
                if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
                    return {
                        lat: center.lat,
                        lon: center.lng
                    };
                }
            }
        } catch (err) {
            console.warn('Kartenmitte konnte nicht gelesen werden:', err);
        }
        return null;
    }

    function getCoordsFromUrl() {
        try {
            const hash = window.location.hash || '';
            const match = hash.match(/#map=\d+\/([-0-9.]+)\/([-0-9.]+)/);
            if (match) {
                return {
                    lat: Number(match[1]),
                    lon: Number(match[2])
                };
            }
        } catch (err) {
            console.warn('URL-Koordinaten konnten nicht gelesen werden:', err);
        }
        return null;
    }

    function ensureCoordsFromFallback() {
        if (contextMenuLat && contextMenuLon) {
            return true;
        }

        const center = getMapCenterCoords();
        if (center && setCoords(center.lat, center.lon, 'Kartenmitte')) {
            return true;
        }

        const fromUrl = getCoordsFromUrl();
        if (fromUrl && setCoords(fromUrl.lat, fromUrl.lon, 'URL')) {
            return true;
        }

        return false;
    }

    function captureCoordinates(e) {
        try {
            if (e && e.latlng && Number.isFinite(e.latlng.lat) && Number.isFinite(e.latlng.lng)) {
                return setCoords(e.latlng.lat, e.latlng.lng, 'Leaflet-Event');
            }

            if (window.map && typeof window.map.mouseEventToLatLng === 'function' && e) {
                const latlng = window.map.mouseEventToLatLng(e);
                if (latlng) {
                    return setCoords(latlng.lat, latlng.lng, 'MouseEvent');
                }
            }
        } catch (err) {
            console.warn('Direkte Koordinatenerfassung fehlgeschlagen:', err);
        }

        return ensureCoordsFromFallback();
    }

    function initLeafletEvents() {
        const checkInterval = setInterval(function () {
            if (window.map && typeof window.map.on === 'function') {
                clearInterval(checkInterval);

                if (leafletReady) return;
                leafletReady = true;

                window.map.on('contextmenu', function (e) {
                    captureCoordinates(e);
                    setTimeout(injectGoogleMapsEntry, 30);
                });

                window.map.on('click', function (e) {
                    captureCoordinates(e);
                });

                console.log('✓ Leaflet-Events aktiviert');
            }
        }, 500);
    }

    function updateMenuLinkHref() {
        const link = document.querySelector('#map-context-menu .gmaps-entry a');
        if (!link) return;

        const url = getGoogleMapsUrl();

        if (url) {
            link.href = url;
            link.setAttribute('data-ready', '1');
            link.style.opacity = '1';
            link.title = `Google Maps mit ${contextMenuLat}, ${contextMenuLon} öffnen`;
        } else {
            link.href = '#';
            link.setAttribute('data-ready', '0');
            link.style.opacity = '0.7';
            link.title = 'Koordinaten noch nicht verfügbar';
        }
    }

    function injectGoogleMapsEntry() {
        const menu = document.querySelector('#map-context-menu .dropdown-menu');
        if (!menu) return false;

        const existing = menu.querySelector('.gmaps-entry');
        if (existing) {
            updateMenuLinkHref();
            return true;
        }

        const items = menu.querySelectorAll('li');
        let closeButtonIndex = -1;

        for (let i = 0; i < items.length; i++) {
            if (items[i].querySelector('.btn-close')) {
                closeButtonIndex = i;
                break;
            }
        }

        const divider = document.createElement('li');
        divider.className = 'gmaps-divider';
        divider.innerHTML = '<hr class="dropdown-divider">';

        const menuItem = document.createElement('li');
        menuItem.className = 'gmaps-entry';
        menuItem.innerHTML = `
            <a class="dropdown-item d-flex align-items-center gap-3" href="#" target="_blank" rel="noopener noreferrer" style="cursor:pointer;">
                <i class="bi bi-map" aria-hidden="true"></i>
                <span>In Google Maps öffnen</span>
            </a>
        `;

        const link = menuItem.querySelector('a');
        link.addEventListener('click', function (e) {
            const ok = contextMenuLat && contextMenuLon ? true : ensureCoordsFromFallback();
            if (!ok) {
                e.preventDefault();
                e.stopPropagation();
                alert('Es konnten keine Koordinaten ermittelt werden.');
                return;
            }

            const url = getGoogleMapsUrl();
            if (!url) {
                e.preventDefault();
                e.stopPropagation();
                alert('Google-Maps-Link konnte nicht erstellt werden.');
                return;
            }

            link.href = url;
            console.log('➤ Öffne Google Maps:', url);
        });

        if (closeButtonIndex > -1) {
            menu.insertBefore(divider, items[closeButtonIndex]);
            menu.insertBefore(menuItem, items[closeButtonIndex]);
        } else {
            menu.appendChild(divider);
            menu.appendChild(menuItem);
        }

        updateMenuLinkHref();
        console.log('✓ Google-Maps-Eintrag wurde eingefügt');
        return true;
    }

    function watchMenu() {
        const observer = new MutationObserver(function () {
            const menu = document.querySelector('#map-context-menu .dropdown-menu');
            if (menu) {
                setTimeout(injectGoogleMapsEntry, 10);
            }
            addGmapsButtons();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('✓ Menü-Beobachtung aktiv');
    }

    function onRightClick() {
        setTimeout(injectGoogleMapsEntry, 30);
        setTimeout(injectGoogleMapsEntry, 120);
        setTimeout(injectGoogleMapsEntry, 250);
    }

    function addGmapsButtons() {
        const links = document.querySelectorAll('a.set_position.stretched-link:not(.gmaps-added)');

        links.forEach(link => {
            link.classList.add('gmaps-added');

            const lat = link.getAttribute('data-lat');
            const lon = link.getAttribute('data-lon');

            if (lat && lon) {
                const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

                const btn = document.createElement('a');
                btn.href = gmapsUrl;
                btn.target = '_blank';
                btn.rel = 'noopener noreferrer';
                btn.innerText = '📍 Google Maps';

                btn.style.display = 'inline-block';
                btn.style.marginLeft = '15px';
                btn.style.padding = '2px 8px';
                btn.style.backgroundColor = '#4285F4';
                btn.style.color = 'white';
                btn.style.textDecoration = 'none';
                btn.style.borderRadius = '4px';
                btn.style.fontSize = '11px';
                btn.style.fontWeight = 'bold';
                btn.style.position = 'relative';
                btn.style.zIndex = '1000';

                link.parentNode.appendChild(btn);
            }
        });
    }

    function init() {
        initLeafletEvents();
        watchMenu();

        document.addEventListener('contextmenu', function (e) {
            captureCoordinates(e);
            onRightClick();
        }, true);

        document.addEventListener('click', function (e) {
            if (e.target.closest('#map')) {
                captureCoordinates(e);
            }
        }, true);

        ensureCoordsFromFallback();
        addGmapsButtons();
        setInterval(addGmapsButtons, 2000);

        console.log('=== OSM Google Maps Script v2.3 gestartet ===');
    }

    init();
})();
