/* eslint-disable no-await-in-loop */
import createDebug from 'debug';
import { DepGraph } from 'dependency-graph';

const debug = createDebug('complycloud:brane:service');

function addDependenciesToGraph({ dependencies }) {
  dependencies.forEach((dependency) => {
    debug('adding dependency "%s" to graph', dependency.id);
    this.addNode(dependency.id, dependency);
    dependency.dependencies.forEach((dependencyDependencyName) => {
      debug('mapping dependency "%s" for "%s"', dependencyDependencyName, dependency.id);
      this.addDependency(dependency.id, dependencyDependencyName);
    });
  });
}

function buildDependencyGraph() {
  debug('building dependency graph');
  const { dependencies } = this;
  const dependencyGraph = new DepGraph();
  addDependenciesToGraph.call(dependencyGraph, { dependencies });
  debug('resolved dependency load order: %o', dependencyGraph.overallOrder());
  return dependencyGraph;
}

async function buildDependencyParams(dependency) {
  debug('building dependency params for "%s"', dependency.id);
  const params = {};
  for (let dependencyName of dependency.dependencies) {
    const dependencyDependency = this.getNodeData(dependencyName);
    params[dependencyDependency.id] = await dependencyDependency.expose(dependency.id);
  }
  debug('build dependency params for "%s": %o', dependency.id, params);
  return params;
}

export default class Service {
  get dependencies() { return []; }

  async start() {
    debug('starting service');
    const dependencyGraph = buildDependencyGraph.call(this);
    for (let dependencyName of dependencyGraph.overallOrder()) {
      debug('starting dependency "%s"', dependencyName);
      const dependency = dependencyGraph.getNodeData(dependencyName);
      await dependency.start(await buildDependencyParams.call(dependencyGraph, dependency));
      debug('dependency "%s" started', dependencyName);
    }
    debug('service started');
  }
}
