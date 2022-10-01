import {readFile} from "fs/promises";
import {promises as fs} from "fs";
import FileHound from "filehound";
import path, {dirname, resolve} from "path";

export interface PackPaths {
    importMap: string;
    directory: string;
    entrypoint?: string;
    capnpTemplate?: string;
}

export interface PackOptions {
    argv: string[];
    paths: PackPaths
}

export interface ImportMap {
    imports: Record<string, string>
}

export const STATEMENT_REGEX = /(?:(?:import|export)(?: .+ from)? ".+";|(?:import\(".+"\)))/g;
export const CAPNP_MODULES_REGEX = /modules\s*=\s*\[[^\]]*],?/g;

async function getCapnPTemplate({ capnpTemplate }: PackPaths): Promise<string | undefined> {
    if (!capnpTemplate) return undefined;
    return await readFile(capnpTemplate, "utf-8").catch(() => undefined)
}

async function getImportMap({ importMap }: PackPaths): Promise<ImportMap> {
    const contents = await readFile(importMap, "utf-8");
    if (contents) {
        try {
            const map = JSON.parse(contents);
            return {
                ...map,
                imports: {
                    ...map?.imports
                }
            }
        } catch {

        }
    }
    return { imports: {} }
}


async function getFilePaths({ directory }: PackPaths): Promise<string[]> {
    return await FileHound.create()
        .paths(directory)
        .discard("node_modules")
        .ext("js")
        .find();
}

export async function pack(options: PackOptions) {
    const { paths, argv } = options;
    const importMap = await getImportMap(paths);
    const processedFiles = new Set();

    let requiredModules:  { moduleName: string, moduleTargetPath: string }[] = []

    const cwd = process.cwd();

    let anyImportsProcessed: boolean;
    do {
        anyImportsProcessed = await importPaths();
    } while (anyImportsProcessed);

    const completeImportMap = await getCompleteImportMap();

    const capnp = argv.includes("--capnp") || paths.capnpTemplate;
    // const binary = argv.includes("--binary");

    if (!capnp) {
        console.log(
            JSON.stringify(
                {
                    ...completeImportMap,
                    ":debug": {
                        options,
                        processedFiles: [
                            ...processedFiles
                        ],
                        importMap
                    }
                },
                undefined,
                "  "
            )
        );
    } else {
        const capnp = await getCapnP(completeImportMap);
        console.log(capnp);
    }

    function tab(string: string, tabs = "  ") {
        return string
            .split("\n")
            .map(value => `${tabs}${value}`)
            .join("\n")
    }

    async function getCapnP(importMap: ImportMap): Promise<string> {
        const modules = Object.entries(importMap.imports)
            .map(
                ([key, value]) => (
                    `(name = "${key}", esModule = embed "${value}")`
                )
            )
            .join(",\n");

        const capnpTemplate = await getCapnPTemplate(paths);

        if (!capnpTemplate) {
            return `modules = [\n${tab(modules)}\n]`;
        }

        let output = capnpTemplate;

        let lines = output.split("\n");

        for (const [foundString] of output.matchAll(CAPNP_MODULES_REGEX)) {
            const suffix = foundString.endsWith(",") ? "," : "";
            const line = lines.find(line => line.includes(foundString));
            const [whitespace] = line.split(foundString);
            output = output.replace(foundString, `modules = [\n${tab(modules, `${whitespace}${whitespace}`)}\n${whitespace}]${suffix}`);

            lines = output.split("\n");
        }

        return output;
    }

    async function getCompleteImportMap(): Promise<ImportMap> {

        const { entrypoint } = paths;

        if (entrypoint) {
            return getFromEntrypoint(entrypoint);
        }

        return getAllFiles();

        async function getAllFiles(): Promise<ImportMap> {
            const filePaths = await getFilePaths(paths);
            return {
                imports: Object.fromEntries(
                    filePaths.map(path => [path, path])
                )
            }
        }

        async function getFromEntrypoint(entrypoint: string): Promise<ImportMap> {
            const urls = await getImportUrls(entrypoint, new Set());
            return {
                imports: Object.fromEntries(
                    [
                        ...new Set([
                            ...urls,
                            entrypoint
                                .replace(/^\.\//, "")
                        ])
                    ].map(path => [path, path])
                )
            };
        }

        async function getImportUrls(moduleUrl: string, seen: Set<string>): Promise<string[]> {

            const directory = dirname(moduleUrl);

            const file = await readFile(moduleUrl, "utf-8").catch(error => {
                // console.error(`Can't read ${moduleUrl}`);
                // throw error;
                return "";
            });

            if (!file) return [];

            const statements = file.match(STATEMENT_REGEX);

            if (!statements?.length) return [];

            const urls = statements
                .map(statement => statement.match(/"(.+)"/)[1])
                .filter(Boolean)
                .map(url => resolve(directory, url)
                    .replace(`${cwd}/`, ""))

            const nextSeen = new Set([
                ...seen,
                ...urls
            ]);
            return [
                ...urls,
                ...(
                    await Promise.all(
                        urls
                            .filter(url => !seen.has(url))
                            .map(url => getImportUrls(url, nextSeen))
                    )
                ).reduce((sum, array) => sum.concat(array), [])
            ];
        }

    }

    async function importPaths(): Promise<boolean> {
        const filePaths = await getFilePaths(paths);
        let any = false;

        for (const filePath of filePaths) {
            if (processedFiles.has(filePath)) {
                continue;
            }
            await processFile(filePath);
            processedFiles.add(filePath);
            any = true;
        }

        return any;

        async function processFile(filePath: string) {

            const initialContents = await fs.readFile(filePath, "utf-8");

            const contents = await process(
                initialContents
            );

            await fs.writeFile(filePath, contents, "utf-8");

            async function process(initialContents: string) {
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

            async function replaceStatement(contents: string, statement: string) {
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

                    const filePathParts = filePath
                        .replace(`${paths.directory.replace(/^\.\//, "")}/`, "")
                        .split("/");
                    const srcShift = [".", ...filePathParts.slice(1).map(() => "..")].join("/");

                    const moduleTargetPath = `${paths.directory}/${moduleName}`;
                    url = `${srcShift}/${moduleName}/${fileName}`;

                    if (!await isDirectory(moduleTargetPath)) {
                        await fs.cp(`./node_modules/${moduleName}`, moduleTargetPath, {
                            recursive: true
                        });
                    }
                } else if (importMapReplacement) {
                    url = importMapReplacement;
                }

                const replacement = await getResolvedStatUrl(url);

                // console.log(url, replacement);

                return contents.replace(
                    statement,
                    statement.replace(
                        initial,
                        replacement
                    )
                );

                async function getResolvedStatUrl(url: string) {
                    const [existing, js, index] = await Promise.all([
                        isFile(path.resolve(path.dirname(filePath), url)),
                        isFile(path.resolve(path.dirname(filePath), url + ".js")),
                        isFile(path.resolve(path.dirname(filePath), url + "/index.js")),
                    ]);
                    if (existing) {
                        return url;
                    }
                    if (js) {
                        return url + ".js";
                    }
                    if (index) {
                        return  url + "/index.js";
                    }
                    return url;
                }
            }
        }
    }
}

export async function isFile(path: string) {
    const stat = await fs.stat(path).catch(() => undefined);
    return !!(stat && stat.isFile());
}

export async function isDirectory(path: string) {
    const stat = await fs.stat(path).catch(() => undefined);
    return !!(stat && stat.isDirectory());
}

