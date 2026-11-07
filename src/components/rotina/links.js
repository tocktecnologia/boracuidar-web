export function marketplaceLinkForCategory(category) {
  const params = new URLSearchParams();
  if (category) params.set("categoria", category);
  params.set("origem", "rotina");
  return `/marketplace?${params.toString()}`;
}

export function marketplaceLinkForCycle(cycle) {
  return marketplaceLinkForCategory(cycle?.category);
}
