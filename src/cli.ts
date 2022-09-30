#!/usr/bin/env node
import { pack } from "./impack";

const argv = process.argv;


const withoutPrefix = argv.filter(value => !value.startsWith("-"));

const importMap = withoutPrefix.at(-2);
const directory = withoutPrefix.at(-1);

await pack({
    argv,
    paths: {
        importMap: importMap ?? "import-map.json",
        directory: directory ?? "build"
    }
})