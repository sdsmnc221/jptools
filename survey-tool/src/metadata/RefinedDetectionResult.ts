export interface Rgss {
  rgss: string | null;
}

export interface Fact {
  [key: string]: string | null;
}

export class Metadata {
  facts: Fact;
  generation: string | null;
  marker: string | null;

  constructor(
    generation: string | null = null,
    marker: string | null = null,
    { rgss, ...args }: Fact,
  ) {
    this.facts = {
      ...(rgss ? { rgss } : {}),
      ...args,
    };
    this.generation = generation;
    this.marker = marker;
  }
}

export class RefinedDetectionResult {
  metadata: Metadata[];
  confidentGeneration: string | null;
  hasConflictingGeneration: boolean;
  reason: string | null;

  constructor({
    metadata,
    confidentGeneration,
    hasConflictingGeneration,
    reason,
  }: {
    metadata?: Metadata[] | null;
    confidentGeneration?: string | null;
    hasConflictingGeneration?: boolean;
    reason?: string | null;
  } = {}) {
    this.metadata = metadata ?? [];
    this.confidentGeneration = confidentGeneration ?? null;
    this.hasConflictingGeneration = hasConflictingGeneration ?? false;
    this.reason = reason ?? null;
  }
}
