export class Metadata {
  constructor(generation = null, marker = null, { rgss, ...args } = {}) {
    this.metadata = {
      ...(rgss ? { rgss } : {}),
      ...args,
    };
    this.generation = generation;
    this.marker = marker;
  }
}

export class RefinedDetectionResult {
  constructor({
    metadata = [],
    confidentGeneration = null,
    hasConflictingGeneration = false,
    reason = null,
  } = {}) {
    this.metadata = metadata;
    this.confidentGeneration = confidentGeneration;
    this.hasConflictingGeneration = hasConflictingGeneration;
    this.reason = reason;
  }
}
