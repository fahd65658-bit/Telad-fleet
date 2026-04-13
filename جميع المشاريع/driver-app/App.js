
import * as Location from 'expo-location';
import axios from 'axios';

setInterval(async () => {
  let loc = await Location.getCurrentPositionAsync({});

  await axios.post('https://api.fna.sa/gps', {
    vehicleId: 1,
    lat: loc.coords.latitude,
    lng: loc.coords.longitude
  });

}, 5000);

export default function App() {
  return null;
}
