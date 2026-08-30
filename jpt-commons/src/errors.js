export class ShimError extends Error {
  constructor(message, exitCode = 10) {
    super(message);
    this.name = this.constructor.name;
    this.exitCode = exitCode;
  }
}

export class UnsupportedError extends ShimError {
  constructor(message) {
    super(message, 2);
  }
}

export class AmbigousError extends ShimError {
  constructor(message) {
    super(message, 3);
  }
}

export class InvalidInputError extends ShimError {
  constructor(message) {
    super(message, 4);
  }
}

export class VerificationError extends ShimError {
  constructor(message) {
    super(message, 5);
  }
}

export class GameTreeError extends ShimError {
  constructor(message) {
    super(message, 6);
  }
}

export class MediaScanError extends ShimError {
  constructor(message) {
    super(message, 7);
  }
}

export class MediaPrepareError extends ShimError {
  constructor(message) {
    super(message, 8);
  }
}
