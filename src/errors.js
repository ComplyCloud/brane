import VError from 'verror';

export class BraneError extends VError { }
export class ServiceConfigurationError extends BraneError { }
export class UnknownDependency extends ServiceConfigurationError { }

export class BadRequest extends BraneError {
  get statusCode() { return 400; }
}
export class InvalidPayload extends BadRequest { }

export class Conflict extends BraneError {
  get statusCode() { return 409; }
}

export class NotFound extends BraneError {
  get statusCode() { return 404; }
}
