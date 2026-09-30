export function publicEvent(event) {
  const { variants, _score, _distanceKm, ...safe } = event;
  return safe;
}
