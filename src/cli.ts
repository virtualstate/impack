#!/usr/bin/env node
import {isFile, pack} from "./impack";
import {dirname} from "path";

const argv = process.argv;


const withoutPrefix = argv.filter(value => !value.startsWith("-"));

const importMap = withoutPrefix.find(name => name.endsWith(".json"))
const path = withoutPrefix.at(-1);

if (!importMap) {
    throw new Error("Expected import map with .json extension");
}

const capnp = argv.find(value => value.startsWith("--capnp="));
const capnpTemplate = capnp && capnp.split("=").at(1);

let directory: string,
    entrypoint: string = undefined;

if (await isFile(path)) {
    directory = dirname(path);
    entrypoint = path;
} else {
    directory = path;
}

await pack({
    argv,
    paths: {
        importMap,
        directory,
        entrypoint,
        capnpTemplate
    }
})