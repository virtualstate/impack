#!/usr/bin/env node
import {isFile, pack} from "./impack";
import {dirname} from "node:path";

const argv = process.argv;


const withoutPrefix = argv.filter(value => !value.startsWith("-"));

const importMap = withoutPrefix.find(name => name.endsWith(".json"))
const path = withoutPrefix.at(-1);

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

const exclude = argv.filter(value => value.startsWith("--exclude="))
    .map(value => value.replace("--exclude=", "").replace(/^['"](.+)['"]$/, "$1"))

await pack({
    argv,
    paths: {
        importMap,
        directory,
        entrypoint,
        capnpTemplate,
        exclude
    }
})