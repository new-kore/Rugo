// Address search: instant results from saved/common places, then OpenStreetMap (Nominatim) for anything else.
export const COMMON_PLACES = [
  { name: 'Northwind DC — Mississauga', address: '6855 Airport Rd', city: 'Mississauga', region: 'ON', lat: 43.6905, lng: -79.6215 },
  { name: 'Northwind Bakery Plant', address: '255 Bremner Blvd', city: 'Toronto', region: 'ON', lat: 43.6416, lng: -79.3871 },
  { name: 'Maple Steel — Mill 2', address: '1330 Burlington St E', city: 'Hamilton', region: 'ON', lat: 43.2637, lng: -79.7898 },
  { name: 'FreshCo Distribution', address: '1900 Bank St', city: 'Ottawa', region: 'ON', lat: 45.3712, lng: -75.6553 },
  { name: 'Port de Montréal — Terminal Viau', address: '4400 Rue Notre-Dame E', city: 'Montréal', region: 'QC', lat: 45.5596, lng: -73.5263 },
  { name: 'Metro Grocers Kingston', address: '1300 Bath Rd', city: 'Kingston', region: 'ON', lat: 44.2437, lng: -76.5584 },
  { name: 'Lakeshore Cold Storage', address: '3800 Rhodes Dr', city: 'Windsor', region: 'ON', lat: 42.2955, lng: -82.9799 },
  { name: 'Forest City Foods', address: '1151 Wilton Grove Rd', city: 'London', region: 'ON', lat: 42.9298, lng: -81.1844 },
  { name: 'Georgian Retail DC', address: '400 Bayview Dr', city: 'Barrie', region: 'ON', lat: 44.3549, lng: -79.6776 },
  { name: 'Grand River Packaging', address: '1305 Bleams Rd', city: 'Kitchener', region: 'ON', lat: 43.4093, lng: -80.4662 },
  { name: 'Épicerie Laurentide', address: '2500 Bd Wilfrid-Hamel', city: 'Québec', region: 'QC', lat: 46.8007, lng: -71.2876 },
  { name: 'Northern Mining Supply', address: '1600 Kingsway', city: 'Sudbury', region: 'ON', lat: 46.5004, lng: -80.9502 },
  { name: 'Niagara Frontier Logistics', address: '2255 Walden Ave', city: 'Buffalo', region: 'NY', lat: 42.9077, lng: -78.7586 },
  { name: 'Motor City Fabrication', address: '6501 E Jefferson Ave', city: 'Detroit', region: 'MI', lat: 42.3536, lng: -82.9849 },
  { name: 'Calgary Logistics Park', address: '11500 52 St SE', city: 'Calgary', region: 'AB', lat: 50.9536, lng: -113.9716 },
  { name: 'Winnipeg CentrePort', address: '1800 Brookside Blvd', city: 'Winnipeg', region: 'MB', lat: 49.9558, lng: -97.2785 },
  { name: 'Vancouver Fraser Port — Deltaport', address: '2 Roberts Bank', city: 'Delta', region: 'BC', lat: 49.0105, lng: -123.1593 },
  { name: 'Halifax Ceres Terminal', address: '3420 Barrington St', city: 'Halifax', region: 'NS', lat: 44.6662, lng: -63.5867 },
  { name: 'Edmonton Industrial Hub', address: '9450 17 Ave NW', city: 'Edmonton', region: 'AB', lat: 53.4555, lng: -113.3802 },
  { name: 'Chicago Intermodal (Joliet)', address: '26664 S Elwood Int Port Rd', city: 'Elwood', region: 'IL', lat: 41.4231, lng: -88.1186 },
];

export function searchLocal(q) {
  const s = q.trim().toLowerCase();
  if (!s) return COMMON_PLACES.slice(0, 6);
  return COMMON_PLACES.filter((p) => `${p.name} ${p.address} ${p.city} ${p.region}`.toLowerCase().includes(s)).slice(0, 6);
}

export async function searchRemote(q, signal) {
  if (q.trim().length < 4) return [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=ca,us&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { signal, headers: { 'Accept-Language': 'en' } });
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map((r) => {
      const a = r.address || {};
      const street = [a.house_number, a.road].filter(Boolean).join(' ');
      return {
        name: r.name || street || r.display_name.split(',')[0],
        address: street || r.display_name.split(',').slice(0, 2).join(','),
        city: a.city || a.town || a.village || a.municipality || a.county || '',
        region: (a['ISO3166-2-lvl4'] || '').split('-')[1] || a.state || '',
        lat: Number(r.lat), lng: Number(r.lon), remote: true,
      };
    });
  } catch {
    return [];
  }
}

/** Google Places (New) autocomplete. Returns [] when Google isn't connected. */
export async function searchGoogle(q) {
  if (q.trim().length < 3) return [];
  const { getKey, googleFailed, loadGoogle } = await import('./google.js');
  if (!getKey() || googleFailed()) return [];
  try {
    const maps = await loadGoogle();
    const { AutocompleteSuggestion } = await maps.importLibrary('places');
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: q, includedRegionCodes: ['ca', 'us'] });
    return suggestions.filter((s) => s.placePrediction).slice(0, 6).map((s) => ({
      name: s.placePrediction.mainText?.text || s.placePrediction.text.text,
      address: s.placePrediction.secondaryText?.text || '',
      city: '', region: '', google: s.placePrediction, remote: true,
    }));
  } catch {
    return [];
  }
}

/** Turn a Google suggestion into a full place with coordinates. */
export async function resolveGoogle(p) {
  const place = p.google.toPlace();
  await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'addressComponents'] });
  const comp = (type, short) => place.addressComponents?.find((c) => c.types.includes(type))?.[short ? 'shortText' : 'longText'] || '';
  const street = [comp('street_number'), comp('route')].filter(Boolean).join(' ');
  return {
    name: place.displayName || p.name,
    address: street || place.formattedAddress?.split(',')[0] || p.name,
    city: comp('locality') || comp('postal_town') || comp('sublocality') || comp('administrative_area_level_2'),
    region: comp('administrative_area_level_1', true),
    lat: place.location.lat(), lng: place.location.lng(),
  };
}

/**
 * Use whatever the person typed as a one-off address. Locates it with Google (when connected),
 * then OpenStreetMap, then the nearest known city named in the text.
 */
export async function geocodeFree(text) {
  const q = text.trim();
  const base = { name: q.split(',')[0], address: q.split(',')[0], oneOff: true };
  try {
    const { getKey, googleFailed, loadGoogle } = await import('./google.js');
    if (getKey() && !googleFailed()) {
      const maps = await loadGoogle();
      const { Geocoder } = await maps.importLibrary('geocoding');
      const { results } = await new Geocoder().geocode({ address: q, componentRestrictions: { country: 'CA' } }).catch(() => new Geocoder().geocode({ address: q }));
      const r = results?.[0];
      if (r) {
        const comp = (t, short) => r.address_components.find((c) => c.types.includes(t))?.[short ? 'short_name' : 'long_name'] || '';
        return { ...base, address: r.formatted_address.split(',')[0], city: comp('locality') || comp('sublocality') || comp('administrative_area_level_2'), region: comp('administrative_area_level_1', true), lat: r.geometry.location.lat(), lng: r.geometry.location.lng() };
      }
    }
  } catch { /* try the next source */ }
  const osm = await searchRemote(q);
  if (osm[0]) return { ...base, address: osm[0].address || q, city: osm[0].city, region: osm[0].region, lat: osm[0].lat, lng: osm[0].lng };
  const { CITIES } = await import('./basemap.js');
  const lower = q.toLowerCase();
  const city = CITIES.find(([n]) => lower.includes(n.toLowerCase()));
  const known = COMMON_PLACES.find((p) => lower.includes(p.city.toLowerCase()));
  if (city) return { ...base, city: city[0], region: known?.region || '', lat: city[1], lng: city[2], approx: true };
  if (known) return { ...base, city: known.city, region: known.region, lat: known.lat, lng: known.lng, approx: true };
  throw new Error('Couldn’t find that address. Add the city, e.g. “120 King St W, Hamilton”.');
}
