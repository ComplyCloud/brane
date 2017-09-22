import createDebug from 'debug';
import glob from 'glob-promise';
import { resolve } from 'path';

const debug = createDebug('complycloud:brane:cli');

const serviceDirectory = resolve(process.cwd());
const eventsDirectory = resolve(serviceDirectory, 'src/events');
const thingsDirectory = resolve(serviceDirectory, 'src/things');
const { Service } = require(serviceDirectory); // eslint-disable-line global-require, import/no-dynamic-require
const service = new Service();

async function loadThings(dir) {
  debug('loading things from %s', dir);
  const files = await glob(`${dir}/*.js`);
  files.forEach((file) => {
    const ThingClass = require(file).default; // eslint-disable-line global-require, import/no-dynamic-require
    debug('loaded %s thing', ThingClass.id);
    this.addThing(ThingClass);
  });
}

async function loadEvents(dir) {
  debug('loading events from %s', dir);
  const files = await glob(`${dir}/*.js`);
  files.forEach((file) => {
    const EventClass = require(file).default; // eslint-disable-line global-require, import/no-dynamic-require
    debug('loaded %s event', EventClass.id);
    this.addEvent(EventClass);
  });
}

async function run() {
  try {
    await loadThings.call(service, thingsDirectory);
    await loadEvents.call(service, eventsDirectory);
    await service.start();
  } catch (err) {
    console.error('failed to start service');
    console.error(err.stack);
  }
}

run();
