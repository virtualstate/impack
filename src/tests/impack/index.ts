import {cp, rmdir} from "node:fs/promises";
import {pack} from "#impack";
import {dirname} from "node:path";
import {chmod} from "fs/promises";

const directory = dirname(new URL(import.meta.url).pathname);

{
    await rmdir("esnext-test").catch(error => void error);
    await cp("esnext", "esnext-test", {
        recursive: true
    });
    await chmod("./esnext-test/cli.js", 0x777);

    await pack({
        argv: [],
        paths: {
            importMap: "src/tests/impack/import-map.json",
            directory: "esnext-test",
            entrypoint: `${directory}/example`
        }
    })
}