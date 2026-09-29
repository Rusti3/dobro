const themeIds = [
  "animals", "ecology", "elderly", "children", "city", "creativity", "activity",
  "education", "events", "online_help", "donation", "recycling", "nature", "charity",
];

export const themeArtwork = Object.freeze(Object.fromEntries(
  themeIds.map((id) => [id, `/theme-images/${id}.jpg`]),
));

export function artworkForEvent(event) {
  const themes = [event?.theme, ...(Array.isArray(event?.themes) ? event.themes : [])];
  return themes.map((id) => themeArtwork[id]).find(Boolean) || themeArtwork.charity;
}
