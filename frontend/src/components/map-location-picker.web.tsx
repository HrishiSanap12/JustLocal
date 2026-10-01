import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { View } from "react-native";

import { MapCoordinate } from "./map-location-picker.types";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629];

function MapClickHandler({ onSelect }: { onSelect: (coordinate: MapCoordinate) => void }) {
  useMapEvents({ click: (event) => onSelect({ latitude: event.latlng.lat, longitude: event.latlng.lng }) });
  return null;
}

function MapViewport({ selected }: { selected: MapCoordinate | null }) {
  const map = useMap();
  useEffect(() => {
    if (selected) map.flyTo([selected.latitude, selected.longitude], Math.max(map.getZoom(), 15), { duration: 0.35 });
  }, [map, selected]);
  return null;
}

export function MapLocationPicker({ selected, onSelect }: { selected: MapCoordinate | null; onSelect: (coordinate: MapCoordinate) => void }) {
  return (
    <View style={{ height: 240, overflow: "hidden", borderRadius: 14 }}>
      <MapContainer center={DEFAULT_CENTER} zoom={5} minZoom={3} maxZoom={19} scrollWheelZoom style={{ width: "100%", height: "100%" }}>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapClickHandler onSelect={onSelect} />
        <MapViewport selected={selected} />
        {selected && <CircleMarker center={[selected.latitude, selected.longitude]} radius={9} pathOptions={{ color: "#FFFFFF", weight: 3, fillColor: "#0D9488", fillOpacity: 1 }} />}
      </MapContainer>
    </View>
  );
}