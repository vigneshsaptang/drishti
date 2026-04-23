import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Known geo coordinates — case-insensitive lookup
const RAW_LOCATIONS = {
  'india': [20.5937, 78.9629], 'worldwide': [20, 0],
  'united kingdom': [55.3781, -3.4360], 'uk': [55.3781, -3.4360],
  'usa': [37.0902, -95.7129], 'us': [37.0902, -95.7129], 'united states': [37.0902, -95.7129],
  'germany': [51.1657, 10.4515], 'netherlands': [52.1326, 5.2913],
  'canada': [56.1304, -106.3468], 'australia': [-25.2744, 133.7751],
  'france': [46.2276, 2.2137], 'pakistan': [30.3753, 69.3451],
  'afghanistan': [33.9391, 67.7100], 'reg': [20.5937, 78.9629],
  'europe': [50.1109, 9.6824], 'asia': [30, 75],
  // Punjab-specific
  'amritsar': [31.6340, 74.8723], 'tarn taran': [31.4519, 74.9275],
  'ferozepur': [30.9260, 74.6130], 'fazilka': [30.4042, 74.0283],
  'pathankot': [32.2754, 75.6382], 'gurdaspur': [32.0414, 75.4032],
  'delhi': [28.7041, 77.1025], 'mumbai': [19.0760, 72.8777],
  'himachal pradesh': [31.1048, 77.1734], 'malana': [32.0749, 77.3432],
  'brazil': [-14.235, -51.925], 'spain': [40.463, -3.749],
  'italy': [41.871, 12.567], 'south africa': [-30.559, 22.937],
};

function findCoord(name) {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  return RAW_LOCATIONS[key] || null;
}

export default function DrugRouteMap({ listings }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [25, 60],
      zoom: 3,
      zoomControl: true,
      attributionControl: false,
    });

    // Light tiles to match the theme
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18,
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => { map.remove(); mapInstanceRef.current = null; layerRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || !layerRef.current || !listings?.length) return;
    layerRef.current.clearLayers();

    // Aggregate routes
    const routes = {};
    const sources = {};
    listings.forEach(l => {
      const from = (l.shipping_from || '').trim();
      const to = (l.shipping_to || '').trim();
      if (from && to) {
        const key = `${from}→${to}`;
        routes[key] = (routes[key] || 0) + 1;
      }
      if (from) sources[from] = (sources[from] || 0) + 1;
    });

    // Draw routes
    Object.entries(routes).forEach(([key, count]) => {
      const [from, to] = key.split('→');
      const fromCoord = findCoord(from);
      const toCoord = findCoord(to);
      if (!fromCoord || !toCoord) return;
      // Skip if same point
      if (fromCoord[0] === toCoord[0] && fromCoord[1] === toCoord[1]) return;

      const weight = Math.min(1 + Math.log2(count + 1), 5);
      L.polyline([fromCoord, toCoord], {
        color: '#ef4444',
        weight,
        opacity: 0.4,
        dashArray: '8 4',
      }).addTo(layerRef.current).bindPopup(`<b>${from} → ${to}</b><br>${count} listing(s)`);
    });

    // Source markers
    Object.entries(sources).forEach(([name, count]) => {
      const coord = findCoord(name);
      if (!coord) return;

      L.circleMarker(coord, {
        radius: Math.min(5 + Math.log2(count + 1) * 3, 14),
        fillColor: '#ef4444',
        color: '#ef4444',
        weight: 1,
        opacity: 0.8,
        fillOpacity: 0.5,
      }).addTo(layerRef.current).bindPopup(`<b>${name}</b><br>${count} listing(s)`);
    });

    // Punjab border district markers — monitoring zones
    ['amritsar', 'tarn taran', 'ferozepur', 'fazilka', 'pathankot', 'gurdaspur'].forEach(zone => {
      const coord = findCoord(zone);
      if (coord) {
        L.circleMarker(coord, {
          radius: 4, fillColor: '#4f46e5', color: '#4f46e5',
          weight: 1, opacity: 0.7, fillOpacity: 0.4,
        }).addTo(layerRef.current).bindPopup(`<b>${zone.charAt(0).toUpperCase() + zone.slice(1)}</b><br>Active monitoring district`);
      }
    });

  }, [listings]);

  return <div ref={mapRef} className="w-full h-full rounded-lg" style={{ minHeight: 300 }} />;
}
