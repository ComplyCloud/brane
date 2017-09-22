/* eslint-disable no-await-in-loop, no-restricted-syntax */
import AJV from 'ajv';
import createDebug from 'debug';
import { DepGraph } from 'dependency-graph';
import { omit } from 'lodash';

import { Errors, Module } from '.';

const INTERNAL_DEPENDENCIES = ['events', 'processEvent', 'things'];

const debug = createDebug('complycloud:brane:service');

/** adds all modules to the dependency graph */
function addNodesToGraph({ dependencies }) {
  dependencies.forEach((dependency) => {
    if (INTERNAL_DEPENDENCIES.includes(dependency.name)) return; // We don't need to add internal deps to the graph
    debug('adding module "%s" to graph', dependency.name);
    this.addNode(dependency.name, dependency);
  });
}

/** maps module dependencies within the graph */
function addDependenciesToGraph({ dependencies }) {
  dependencies.forEach((dependency) => {
    dependency.dependencies.forEach((dependencyDependencyName) => {
      if (INTERNAL_DEPENDENCIES.includes(dependencyDependencyName)) return; // no internal deps on the graph
      debug('mapping module dependency "%s" from "%s"', dependencyDependencyName, dependency.name);
      try {
        this.addDependency(dependency.name, dependencyDependencyName);
      } catch (err) {
        throw new Errors.UnknownDependency(err, 'failed to find dependency "%s"', dependencyDependencyName);
      }
    });
  });
}

/** builds the modular dependency graph which is used to establish a start order */
function buildDependencyGraph() {
  debug('building module graph');
  const { dependencies } = this;
  const dependencyGraph = new DepGraph();
  addNodesToGraph.call(dependencyGraph, { dependencies });
  addDependenciesToGraph.call(dependencyGraph, { dependencies });
  debug('resolved module load order: %o', dependencyGraph.overallOrder());
  return dependencyGraph;
}

/** returns modular dependencies required by a module */
async function buildDependencyParams(dependency, context) {
  debug('building dependency params %o for "%s"', dependency.dependencies, dependency.name);
  const params = {};
  for (const dependencyName of dependency.dependencies) {
    if (!INTERNAL_DEPENDENCIES.includes(dependencyName)) {
      const dependencyDependency = this.getNodeData(dependencyName);
      params[dependencyDependency.name] = await dependencyDependency.expose(dependency, context);
    }
  }
  debug('built dependency params for "%s": %o', dependency.name, Object.keys(params));
  return params;
}

/** returns internal dependencies required by a module */
function getInternalDependencies(dependency) {
  debug('building module internal dependency params for "%s"', dependency.name);
  const params = {};
  dependency.dependencies.forEach((dependencyName) => {
    if (INTERNAL_DEPENDENCIES.includes(dependencyName)) {
      params[dependencyName] = this[dependencyName].bind ? this[dependencyName].bind(this) : this[dependencyName];
    }
  });
  debug('built module internal dependency params for "%s": %o', dependency.name, Object.keys(params));
  return params;
}

/** deep converts properties of a defined names to a string */
function stringifyKeys(object, keys) {
  const newObject = Object.assign({}, object);
  Object.keys(newObject).forEach((propertyName) => {
    let property = newObject[propertyName];
    if (
      typeof property === 'object'
      && !(property instanceof RegExp)
      && !(Array.isArray(property))
    ) property = stringifyKeys(property, keys);
    if (keys.includes(propertyName)) {
      let propertyString = property.toString();
      if (property instanceof RegExp) {
        // remove the bracketing forward slashes from RegExp.toString() (e.g., /^asdf$/ to ^asdf$)
        propertyString = propertyString.substring(1, propertyString.length - 1);
      }
      property = propertyString;
    }
    newObject[propertyName] = property;
  });
  return newObject;
}

/** converts our object module schemas into json schemas */
function convertSchemaToJSONSchema(schema) {
  let jsonSchema = {
    type: 'object',
    properties: {},
    additionalProperties: false,
    required: [],
  };
  Object.keys(schema).forEach((propertyName) => {
    jsonSchema.properties[propertyName] = omit(schema[propertyName], ['required']);
    jsonSchema = stringifyKeys(jsonSchema, ['pattern']);
    if (schema[propertyName].required) {
      jsonSchema.required.push(propertyName);
    }
  });
  debug('compiled schema %o', jsonSchema);
  return jsonSchema;
}

export default class Service extends Module {
  constructor() {
    super();
    this.ajv = new AJV();
    this.eventLog = [];
    this.events = {};
    this.things = {};
  }

  addEvent(EventClass) {
    const { ajv } = this;
    debug('adding %s event', EventClass.name);
    this.events[EventClass.name] = EventClass;
    this.events[EventClass.name].jsonSchema = convertSchemaToJSONSchema(EventClass.schema);
    this.events[EventClass.name].jsonSchemaValidate = ajv.compile(this.events[EventClass.name].jsonSchema);
    this.events[EventClass.name].validatePayload = function validatePayload(payload) {
      const valid = this.jsonSchemaValidate(payload);
      if (!valid) {
        throw new Errors.InvalidPayload(ajv.errorsText(this.jsonSchemaValidate.errors));
      }
    };
  }

  addThing(ThingClass) {
    debug('adding %s thing', ThingClass.name);
    this.things[ThingClass.name] = ThingClass;
  }

  async start() {
    debug('starting service');
    this.dependencyGraph = buildDependencyGraph.call(this);
    for (const dependencyName of this.dependencyGraph.overallOrder()) {
      const dependency = this.dependencyGraph.getNodeData(dependencyName);
      const startParams = Object.assign(
        {},
        await buildDependencyParams.call(this.dependencyGraph, dependency),
        getInternalDependencies.call(this, dependency),
      );
      debug('starting module "%s" with params %o', dependencyName, Object.keys(startParams));
      await dependency.start(startParams);
      debug('module "%s" started', dependencyName);
    }
    debug('service started');
  }

  async processEvent(event) {
    // Event.validatePayload(payload);
    // const event = new Event(payload);
    const injections = await buildDependencyParams.call(this.dependencyGraph, event.constructor, { eventId: event.id });
    Object.keys(injections).forEach((injectionName) => { event[injectionName] = injections[injectionName]; });
    try {
      const result = await event.process(this.things);
      this.eventLog.push(event);
      if (this.dependencyGraph.hasNode('log')) {
        (await this.dependencyGraph.getNodeData('log').expose()).info({ eventId: event.id }, 'event logged');
      }
      return result;
    } catch (err) {
      if (this.dependencyGraph.hasNode('log')) {
        (await this.dependencyGraph.getNodeData('log').expose()).warn({ eventId: event.id }, 'event discarded');
      }
      throw err;
    }
  }
}
