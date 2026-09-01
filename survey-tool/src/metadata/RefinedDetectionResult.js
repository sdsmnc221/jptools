export class Metadata {
  constructor(generation = null, marker = null, { rgss, ...args } = {}) {
    this.metadata = {
      ...(rgss ? { rgss } : {}),
      ...args,
    };
    this.generation = generation;
    this.marker = marker;
  }

  // may need to format DLL filenames consistently
  formatDllFilename(filename) {
    const parts = filename.split(".");
    return parts[0].toUpperCase() + "." + parts[1].toLowerCase();
  }
}

export class RefinedDetectionResult {
  constructor(
    metadata = [],
    confidentGeneration = null,
    hasConflictingGeneration = false,
  ) {
    this.metadata = metadata;
    this.confidentGeneration = confidentGeneration;
    this.hasConflictingGeneration = hasConflictingGeneration;
  }
}
