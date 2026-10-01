import { useEffect, useRef } from "react";
import MapView, { MapPressEvent, Marker, UrlTile } from "react-native-maps";
import { Text, View } from "react-native";

import { MapCoordinate } from "./map-location-picker.types";

const DEFAULT_REGION = {
  latitude: 20.5937,
  longitude: 78.9629,
  latitudeDelta: 18,
  longitudeDelta: 18,
};

export function MapLocationPicker({ selected, onSelect }: { selected: MapCoordinate | null; onSelect: (coordinate: MapCoordinate) => void }) {
  const map = useRef<MapView | null>(null);

  useEffect(() => {
    if (selected) {
      map.current?.animateToRegion({ ...selected, latitudeDelta: 0.025, longitudeDelta: 0.025 }, 300);
    }
  }, [selected]);

  return (
    <View style={{ overflow: "hidden", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
      <MapView
        ref={map}
        style={{ width: "100%", height: 240 }}
        initialRegion={selected ? { ...selected, latitudeDelta: 0.025, longitudeDelta: 0.025 } : DEFAULT_REGION}
        mapType="none"
        onPress={(event: MapPressEvent) => onSelect(event.nativeEvent.coordinate)}
      >
        <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} />
        {selected && <Marker coordinate={selected} pinColor="#0D9488" />}
      </MapView>
      <Text style={{ paddingHorizontal: 8, paddingVertical: 4, color: "#64748B", backgroundColor: "#FFFFFF", fontSize: 10 }}>Map data © OpenStreetMap contributors</Text>
    </View>
  );
}