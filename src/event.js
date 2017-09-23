import { v4 as uuid } from 'uuid';

export default class Event {
  constructor(payload) {
    this.constructor.validatePayload(payload);
    Object.keys(payload).forEach((propertyName) => {
      this[propertyName] = payload[propertyName];
    });
    this.id = uuid();
    this.timestamp = new Date();
  }

  get dependencies() { return []; }
}
