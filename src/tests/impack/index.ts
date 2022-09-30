import {cp, rmdir} from "fs/promises";
import {pack} from "../../impack";
import {dirname} from "path";

const directory = dirname(new URL(import.meta.url).pathname);

{
    await rmdir("esnext-test").catch(error => void error);
    await cp("esnext", "esnext-test", {
        recursive: true
    });

    await pack({
        argv: [],
        paths: {
            importMap: "src/tests/impack/import-map.json",
            directory: "esnext-test",
            entrypoint: `${directory}/example`
        }
    })
}