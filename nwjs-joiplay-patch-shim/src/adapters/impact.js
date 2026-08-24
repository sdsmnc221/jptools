export async function detectImpact(tree) {
  return {
    engine: "impact",
    adapter: "impact-html5",
    decisive: false,
    stubbed: true,
  };
}
