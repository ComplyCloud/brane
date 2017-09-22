export default class Module {
  get dependencies() { return []; }

  async expose() {
    return {};
  }

  async start() {
    return true;
  }

  async stop() {
    return true;
  }
}
