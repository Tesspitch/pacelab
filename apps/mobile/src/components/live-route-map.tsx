import { useMemo, useState } from 'react';
import { PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import type { ActivityGpsPoint } from '@/lib/database';

type Props = { points: ActivityGpsPoint[]; zoom?: number };
const openFreeMapStyle = 'https://tiles.openfreemap.org/styles/liberty';

export function LiveRouteMap({ points, zoom = 1.18 }: Props) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const responder = useMemo(() => PanResponder.create({ onStartShouldSetPanResponder: () => true, onPanResponderMove: (_, gesture) => setPan({ x: pan.x + gesture.dx, y: pan.y + gesture.dy }) }), [pan]);
  if (Platform.OS === 'web') return <View style={styles.fallback} {...responder.panHandlers}><View style={[mapSurface, { transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: zoom }] }]}><View style={[styles.mapRoad, styles.roadOne]} /><View style={[styles.mapRoad, styles.roadTwo]} /><View style={[styles.mapRoad, styles.roadThree]} /><View style={styles.fakeRoute}>{(points.length ? points.slice(-24) : Array.from({ length: 12 })).map((point, index) => <View key={index} style={[styles.fakePoint, { left: points.length ? 16 + (index % 12) * 22 : 112 + Math.cos(index * .55) * 70, top: points.length ? 28 + Math.sin(index * 0.7) * 24 + Math.floor(index / 12) * 42 : 54 + Math.sin(index * .55) * 30 }]} />)}</View><View style={styles.currentMarker}><Text style={styles.markerText}>●</Text></View></View><Text style={styles.fallbackText}>ลากแผนที่เพื่อเลื่อน · OpenFreeMap preview</Text></View>;
  // Kept behind the native platform branch so Expo Web never evaluates MapLibre's native view.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const MapLibre = require('@maplibre/maplibre-react-native') as typeof import('@maplibre/maplibre-react-native');
  const last = points.at(-1);
  const coordinates = points.map((point) => [point.longitude, point.latitude]);
  const line = { type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: {} } as const;
  return <View style={styles.map}><MapLibre.Map style={StyleSheet.absoluteFill} mapStyle={openFreeMapStyle}><MapLibre.Camera initialViewState={{ center: last ? [last.longitude, last.latitude] : [100.5, 13.75], zoom: last ? 17 : 2 }} trackUserLocation="default" /><MapLibre.UserLocation animated accuracy /><MapLibre.GeoJSONSource id="pacelab-live-route" data={line}><MapLibre.Layer id="pacelab-live-route-line" type="line" source="pacelab-live-route" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': '#43C7B5', 'line-width': 5 }} /></MapLibre.GeoJSONSource></MapLibre.Map><View style={styles.badge}><Text style={styles.badgeText}>● LIVE GPS · OPENFREEMAP</Text></View></View>;
}

const fill = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 };
const mapSurface = fill;
const styles = StyleSheet.create({ map: { height: 360, overflow: 'hidden', backgroundColor: '#DDE8EE' }, badge: { position: 'absolute', top: 12, left: 12, backgroundColor: '#172434', paddingHorizontal: 10, paddingVertical: 6 }, badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' }, fallback: { height: 360, overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 12, backgroundColor: '#DCEBE8' }, grid: { ...fill, opacity: .25, backgroundColor: '#B7D3D0', borderWidth: 1, borderColor: '#FFFFFF' }, mapRoad: { position: 'absolute', height: 9, backgroundColor: '#FFFFFF', opacity: .75, width: '140%' }, roadOne: { transform: [{ rotate: '24deg' }], top: 30, left: -20 }, roadTwo: { transform: [{ rotate: '-28deg' }], top: 78, left: -30 }, roadThree: { transform: [{ rotate: '4deg' }], top: 98, left: -20 }, fakeRoute: { ...fill }, fakePoint: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: '#299F92' }, currentMarker: { position: 'absolute', top: 45, left: '50%', width: 30, height: 30, marginLeft: -15, borderRadius: 15, backgroundColor: '#F38A7B', borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, markerText: { color: '#FFFFFF', fontSize: 14 }, fallbackText: { color: '#172434', fontWeight: '900', backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 5 } });



