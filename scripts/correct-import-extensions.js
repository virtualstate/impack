import FileHound from "filehound";
import { promises as fs } from "fs";
import path from "path";

export const STATEMENT_REGEX = /(?:(?:import|export)(?: .+ from)? ".+";|(?:import\(".+"\)))/g;

async function isFile(file) {
    const stat = await fs.stat(file).catch(() => undefined);
    return !!(stat && stat.isFile());
}

async function isDirectory(file) {
    const stat = await fs.stat(file).catch(() => undefined);
    return !!(stat && stat.isDirectory());
}

let newModules = [];

async function importPaths(buildPath, importMapPath = process.env.IMPORT_MAP, readPath = buildPath) {
    // console.log({
    //     buildPath,
    //     readPath
    // })

    const filePaths = await FileHound.create()
        .paths(readPath)
        .discard("node_modules")
        .ext("js")
        .find();

    // await Promise.all(
    //     filePaths.map(getFileContents)
    // );

    for (const filePath of filePaths) {
        await getFileContents(filePath);
    }

    async function getFileContents(filePath) {
        const filePathParts = filePath.split("/");
        const srcShift = [...filePathParts]
            .slice(2)
            // Replace with shift up directory
            .map(() => "..")
            .join("/")
        const cwdShift = [...filePathParts]
            .slice(1)
            // Replace with shift up directory
            .map(() => "..")
            .join("/");

        // console.log("Reading", { filePath });
        const initialContents = await fs.readFile(filePath, "utf-8");

        const importMapSource = importMapPath
            ? JSON.parse(
                await fs.readFile(importMapPath, "utf-8").catch(() => `{"imports":{}}`)
            )
            : undefined;

        const importMap = {
            imports: {
                ...importMapSource?.imports
            }
        }

        let contents = initialContents,
            previousContents = initialContents;

        let times = 0;
        do {
            times += 1;
            previousContents = contents;
            contents = await process(
                contents
            );
        } while (contents !== previousContents);

        // console.log({ times });

        await fs.writeFile(filePath, contents, "utf-8");

        async function process(initialContents) {
            const statements = initialContents.match(STATEMENT_REGEX);
            if (!statements) {
                return initialContents;
            }
            let contents = initialContents;
            for (const statement of statements) {
                contents = await replaceStatement(contents, statement);
            }
            return contents;
        }

        async function replaceStatement(contents, statement) {
            // console.log({ filePath, statement });
            const initial = statement.match(/"(.+)"/)[1];

            let url = initial;

            const importMapReplacement = importMap.imports[url];

            // External dependency
            if (importMapReplacement && importMapReplacement.startsWith("./node_modules/")) {
                let moduleName,
                    fileName;

                const moduleUrl = importMapReplacement.replace("./node_modules/", "")
                if (moduleUrl.startsWith("@")) {
                    const [namespace, scopedName, ...rest] = moduleUrl
                        .split("/")
                    moduleName = `${namespace}/${scopedName}`;
                    fileName = rest.join("/");
                } else {
                    const [name, ...rest] = moduleUrl
                        .split("/");
                    moduleName = name;
                    fileName = rest.join("/");
                }

                const moduleTargetPath = `${buildPath}/${moduleName}`;
                url = `${srcShift}/${moduleName}/${fileName}`;

                // console.log({ filePath, statement, importMapReplacement, moduleName, fileName, moduleUrl, url });

                if (!await isDirectory(moduleTargetPath)) {
                    await fs.cp(`./node_modules/${moduleName}`, moduleTargetPath, {
                        recursive: true
                    });
                    newModules.push({
                        moduleName,
                        moduleTargetPath
                    })
                }
            } else if (importMapReplacement) {
                if (importMapReplacement.includes("./src")) {
                    url = importMapReplacement
                        .replace("./src", srcShift)
                        .replace(/\.tsx?$/, ".js");
                } else if (importMapReplacement.startsWith("./")) {
                    url = importMapReplacement
                        .replace(/^\./, cwdShift);
                } else {
                    url = importMapReplacement;
                }
            }

            const replacement = await getResolvedStatUrl(url);

            // console.log({ url, importMapReplacement, importMap, replacement })

            return contents.replace(
                statement,
                statement.replace(
                    initial,
                    replacement
                )
            );

            async function getResolvedStatUrl(url) {
                const [existing, js, index] = await Promise.all([
                    isFile(path.resolve(path.dirname(filePath), url)),
                    isFile(path.resolve(path.dirname(filePath), url + ".js")),
                    isFile(path.resolve(path.dirname(filePath), url + "/index.js")),
                ]);
                // console.log({
                //     url,
                //     existing, js, index
                // })
                if (existing) {
                    return url;
                }
                if (js) {
                    return url + ".js";
                }
                if (index) {
                    return  url + "/index.js";
                }

                // console.error(`Don't know what to do with ${url} for ${statement} in ${filePath}`);
                // throw "";
                return url;
            }
        }
    }
}

await importPaths("esnext");


// await fs.rmdir("esnext-workerd").catch(error => void error);
// await fs.cp("esnext", "esnext-workerd", {
//     recursive: true
// });
//
// await importPaths("esnext-workerd", process.env.IMPORT_MAP_WORKERD || "import-map-workerd.json")
//
// while (newModules.length) {
//     newModules = [];
//     await importPaths("esnext-workerd", process.env.IMPORT_MAP_WORKERD || "import-map-workerd.json")
// }

// console.log("Import Extensions done");

// import { URLPattern } from "../../../../urlpattern-polyfill/esnext/dist/index.js";