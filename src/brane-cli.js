import { resolve } from 'path';

const serviceDirectory = resolve(process.cwd());
const { Service } = require(serviceDirectory);
const service = new Service();
service.start();
