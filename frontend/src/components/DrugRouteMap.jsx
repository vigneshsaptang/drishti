import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Known geo coordinates for drug route mapping
const LOCATIONS = {
  'India': [20.5937, 78.9629], 'Worldwide': [20, 0],
  'United Kingdom': [55.3781, -3.4360], 'USA': [37.0902, -95.7129],
  'Germany': [51.1657, 10.4515], 'Netherlands': [52.1326, 5.2913],
  'Canada': [56.1304, -106.3468], 'Australia': [-25.2744, 133.7751],
  'France': [46.2276, 2.2137], 'Pakistan': [30.3753, 69.3451],
  'Afghanistan': [33.9391, 67.7100], 'REG': [20.5937, 78.9629],
  // Punjab-specific
  'Amritsar': [31.6340, 74.8723], 'Tarn Taran': [31.4519, 74.9275],
  'Ferozepur': [30.9260, 74.6130], 'Fazilka': [30.4042, 74.0283],
  'Pathankot': [32.2754, 75.6382], 'Gurdaspur': [32.0414, 75.4032],
  'Delhi': [28.7041, 77.1025], 'Mumbai': [19.0760, 72.8777],
  'Himachal Pradesh': [31.1048, 77.1734], 'Malana': [32.0749, 77.3432],
};

export default function DrugRouteMap({ listings }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [25, 60],
      zoom: 3,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18,
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => { map.remove(); mapInstanceRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || !listings?.length) return;
    const map = mapInstanceRef.current;

    // Clear existing layers
    map.eachLayer(layer => { if (layer instanceof L.CircleMarker || layer instanceof L.Polyline) map.removeLayer(layer); });

    // Aggregate routes
    const routes = {};
    listings.forEach(l => {
      const from = l.shipping_from?.trim();
      const to = l.shipping_to?.trim();
      if (from && to) {
        const key = `${from}→${to}`;
        routes[key] = (routes[key] || 0) + 1;
      }
    });

    // Draw routes
    Object.entries(routes).forEach(([key, count]) => {
      const [from, to] = key.split('→');
      const fromCoord = LOCATIONS[from];
      const toCoord = LOCATIONS[to];
      if (!fromCoord || !toCoord) return;

      // Route line
      const weight = Math.min(1 + Math.log2(count), 6);
      L.polyline([fromCoord, toCoord], {
        color: '#ef4444',
        weight,
        opacity: 0.4,
        dashArray: '8 4',
      }).addTo(map).bindPopup(`<b>${from} → ${to}</b><br>${count} listings`);

      // Source marker
      L.circleMarker(fromCoord, {
        radius: Math.min(4 + Math.log2(count) * 2, 12),
        fillColor: '#ef4444',
        color: '#ef4444',
        weight: 1,
        opacity: 0.8,
        fillOpacity: 0.5,
      }).addTo(map).bindPopup(`<b>${from}</b><br>Source: ${count} listings`);

      // Destination marker
      L.circleMarker(toCoord, {
        radius: 5,
        fillColor: '#f59e0b',
        color: '#f59e0b',
        weight: 1,
        opacity: 0.6,
        fillOpacity: 0.3,
      }).addTo(map);
    });

    // Punjab border markers
    const borderZones = ['Amritsar', 'Tarn Taran', 'Ferozepur', 'Fazilka', 'Pathankot', 'Gurdaspur'];
    borderZones.forEach(zone => {
      const coord = LOCATIONS[zone];
      if (coord) {
        L.circleMarker(coord, {
          radius: 4,
          fillColor: '#06b6d4',
          color: '#06b6d4',
          weight: 1,
          opacity: 0.7,
          fillOpacity: 0.4,
        }).addTo(map).bindPopup(`<b>${zone}</b><br>Border vulnerability zone`);
      }
    });

  }, [listings]);

  return <div ref={mapRef} className="w-full h-full rounded" style={{ minHeight: 400 }} />;
}
