// Strip every non-alphanumeric character, preserve case.
const gameId = (title) => title.replace(/[^A-Za-z0-9]/g, "");

export { gameId };
