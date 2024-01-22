import {readFile} from "node:fs/promises";
import {promises as fs} from "node:fs";
import FileHound from "filehound";
import path, {dirname, resolve} from "node:path";
import {isPromise, ok} from "../is";
import {writeFile} from "fs/promises";
import {createHash } from "node:crypto";

export interface PackPaths {
    importMap?: string;
    directory: string;
    entrypoint?: string;
    capnpTemplate?: string;
}

export interface ResolveIdOptions extends Record<string, unknown> {
    isEntry: boolean;
}

export interface ResolvedObject extends Record<string, unknown> {
    id: string;
}
export type Resolved = string | ResolvedObject;
export type MaybeResolved = Resolved | undefined;

// 👀
// https://rollupjs.org/guide/en/
// https://vitejs.dev/guide/api-plugin.html
export interface ResolveFn {
    (
        source: string,
        // This will always be undefined for now
        importer: string | undefined,
        options: ResolveIdOptions
    ): MaybeResolved | Promise<MaybeResolved>
}

export interface PackOptions {
    argv?: string[];
    paths: PackPaths;
    resolve?: ResolveFn | ResolveFn[];
}

export interface ImportMap {
    imports: Record<string, string>
}

export const STATEMENT_REGEX = /(?:(?:import|export)(?: .+ from)?\s+['"].+['"]|(?:import\s+\(['"].+["']\))|(?:import\(['"].+["']\)))/g;

// Must be empty modules & bindings to be auto updated
export const CAPNP_MODULES_REGEX = /modules\s*=\s*\[],?/g;
export const CAPNP_BINDINGS_REGEX = /bindings\s*=\s*\[],?/g;

export const JSX_MODULE_FOOTER_MARKER = "// Auto Generated: JSX Service";
export const JSX_MODULE_FOOTER_MARKER_START = `${JSX_MODULE_FOOTER_MARKER} Start`;
export const JSX_MODULE_FOOTER_MARKER_END = `${JSX_MODULE_FOOTER_MARKER} End`;

async function getCapnPTemplate({ capnpTemplate }: PackPaths): Promise<string | undefined> {
    if (!capnpTemplate) return undefined;
    return await readFile(capnpTemplate, "utf-8").catch(() => undefined)
}

function getDefaultMap(): ImportMap {
    return { imports: {} }
}

async function getImportMap({ importMap }: PackPaths): Promise<ImportMap> {
    if (!importMap) return getDefaultMap();
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
    return getDefaultMap();
}


async function getFilePaths({ directory }: PackPaths): Promise<string[]> {
    return await FileHound.create()
        .paths(directory)
        .discard("node_modules")
        .ext("js")
        .find();
}

export async function pack(options: PackOptions) {
    const { paths, argv, resolve: externalResolves } = options;
    const importMap = await getImportMap(paths);
    const processedFiles = new Set();

    const cwd = process.cwd();

    let anyImportsProcessed: boolean;
    do {
        anyImportsProcessed = await importPaths();
    } while (anyImportsProcessed);

    const completeImportMap = await getCompleteImportMap();

    const capnp = argv?.includes("--capnp") || paths.capnpTemplate;
    // const binary = argv.includes("--binary");
    const silent = argv?.includes("--silent");

    if (!capnp) {
        const json = JSON.stringify(
            completeImportMap,
            undefined,
            "  "
        );
        if (!silent) {
            console.log(json);
        }
        return json;
    } else {
        const capnp = await getCapnP(completeImportMap);
        if (!silent) {
            console.log(capnp);
        }
        return capnp;
    }

    function tab(string: string, tabs = "  ") {
        return string
            .split("\n")
            .map(value => `${tabs}${value}`)
            .join("\n")
    }

    async function getCapnP(importMap: ImportMap): Promise<string> {


        const modules = getModulesString(importMap)

        const capnpTemplate = await getCapnPTemplate(paths);

        if (!capnpTemplate) {
            return `modules = [\n${tab(modules)}\n]`;
        }

        let output = capnpTemplate;

        let lines = output.split("\n");

        for (const [foundString] of output.matchAll(CAPNP_MODULES_REGEX)) {
            const suffix = foundString.endsWith(",") ? "," : "";
            const line = lines.find(line => line.includes(foundString));
            if (!line) continue;
            const [whitespace] = line.split(foundString);
            output = output.replace(foundString, `modules = [\n${tab(modules, `${whitespace}${whitespace}`)}\n${whitespace}]${suffix}`);

            lines = output.split("\n");
        }

        if (argv?.includes("--listen-jsx")) {
            const { services, bindings } = await getCapnPListenJSXBindings(modules, importMap);
            // console.log({ services, bindings });
            if (services && bindings.length) {
                output = `${output}\n\n${services}`;
                lines = output.split("\n");
            }
        }

        return output;
    }

    function getModulesString(importMap: ImportMap, entryPoint?: string) {
        const entries = Object.entries(importMap.imports)
            .filter(([key, value]) => key !== entryPoint && value !== entryPoint) ;
        if (entryPoint) {
            entries.unshift([entryPoint, entryPoint])
        }
        return entries
            .map(
                ([key, value]) => (
                    `(name = "${key}", esModule = embed "${value}")`
                )
            )
            .join(",\n")
    }

    async function getCapnPListenJSXBindings(modules: string, importMap: ImportMap) {

        const cwd = process.cwd();

        // console.log({ cwd });

        const processed = (
            await Promise.all(
                Object.entries(importMap.imports)
                    .map(
                        ([, path]) => processJSXFunctionFile(path)
                    )
            )
        )
            .filter(Boolean);

        const services = processed.map(
            ({ services }) => services
        ).join("\n\n");

        const bindings = processed.reduce(
            (all: string[], { bindings }) => all.concat(bindings),
            []
        );

        return { services, bindings };

        async function processJSXFunctionFile(path: string): Promise<{ services: string, bindings: string[] } | undefined> {

            const module = await import(
                `${cwd}/${path}`
            ).catch(() => undefined);

            if (!module) return undefined;

            let contents = await readFile(path, "utf-8");

            if (contents.includes(JSX_MODULE_FOOTER_MARKER_START) && contents.includes(JSX_MODULE_FOOTER_MARKER_END)) {
                contents = `${
                    contents.slice(0, contents.indexOf(JSX_MODULE_FOOTER_MARKER_START))
                }${
                    contents.slice(contents.indexOf(JSX_MODULE_FOOTER_MARKER_END) + JSX_MODULE_FOOTER_MARKER_END.length)
                }`
            }

            let tryCount = 0;

            const bindings: string[] = [];
            const existingBindings = [];

            let baseServiceName: string = `internalJSXResolver${(await hash(path)).toUpperCase()}`;

            for (const [key, value] of Object.entries(module)) {
                if (typeof value !== "function") continue;

                if (Symbol.for(":jsx/type") in value && Symbol.asyncIterator in value) {
                    bindings.push(key);
                    existingBindings.push(key);
                    continue;
                }

                const script = makeScript(key);
                await writeFile(path, withFooter(script), "utf-8");

                tryCount += 1;

                let loaded;

                try {
                    loaded = await import(
                        `${cwd}/${path}?try=${tryCount}&bust=${Date.now()}`
                    );
                } catch (error) {
                    // console.error(error);
                    continue;
                }

                if (
                    typeof loaded[key][Symbol.for(":jsx/type")] === "function" &&
                    typeof loaded[key][Symbol.asyncIterator] === "function"
                ) {
                    bindings.push(key);
                }
            }

            if (!bindings.length) {
                await writeFile(path, contents, "utf-8");
                return undefined;
            }

            // console.log(bindings);

            const script = bindings.map(makeScript).join("\n\n");

            await writeFile(path, withFooter(script), "utf-8");

            const services = bindings.map(
                key => {
                    const serviceName = getServiceName(key);
                    return [
                        `const ${serviceName} :Workerd.Worker = (`,
                        `  modules = [\n${tab(getModulesString(importMap, path), "    ")}\n  ],`,
                        `  bindings = [\n    (name = "${serviceName}")\n  ]`, // This will be replaced with all bindings!
                        `);`
                    ].join("\n")
                }
            ).join("\n\n");

            return { services, bindings: bindings.map(getServiceName) } as const;

            function getServiceName(key: string) {
                return `${baseServiceName}${key}`
            }

            function withFooter(script: string) {
                return [
                    contents,
                    JSX_MODULE_FOOTER_MARKER_START,
                    script,
                    JSX_MODULE_FOOTER_MARKER_END
                ].join("\n")
            }

            function makeScript(key: string) {
                const serviceName = getServiceName(key);
                return `
const $___IsRawFetchEvent = Symbol("Raw Fetch Event");

${key}[Symbol.for(":jsx/type")] = function ${key}Resolver(options, input) {
    if (options[$___IsRawFetchEvent]) {
       // Allow to pass directly to the function
       return ${key}(options, input);
    }
    
    if (typeof env === "undefined") {
       // No environment, use directly
       return ${key}(options, input);
    }
    
    if (!env[key] || !env[key].fetch) {
       // No fetch, use directly
       return ${key}(options, input);
    }
    
    async function fetcher(...args) {
      return env[key].fetch(...args);
    }
    
    console.log("Using service");
    
    return async function FetchLike() {
      const { Fetch } = await import("@virtualstate/listen");
    
      return Fetch(
        {
           ...options,
           fetch: fetcher
        },
        input   
      );
    }
}
${key}[Symbol.asyncIterator] = async function *EmptyResolve() {

}

export async function ${serviceName}(event) {
    const { respondWith } = await import("@virtualstate/listen");
    const options = {
        event,
        request: event.request,
    };
    let f;
    if (typeof h !== "undefined") {
       f = h;
    } else {
       const { h } = await import("@virtualstate/focus");
       
    }
    return respondWith(event, );
}
                `.trim();
            }
        }


    }


    async function hash(value: string) {
        const container = createHash("sha256");
        container.update(value);
        return container.digest().toString("hex");
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
                            entrypoint
                                .replace(/^\.\//, ""),
                            ...urls,

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

            // console.log(file);

            const statements = file.match(STATEMENT_REGEX);

            if (!statements?.length) return [];

            const urls = statements
                .map(statement => statement.match(/"(.+)"/)[1])
                .filter(Boolean)
                .filter(url => url.startsWith("../") || url.startsWith("./"))
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

            try {

                await fs.writeFile(filePath, contents, "utf-8");
            } catch (error) {
                console.warn(`Failed to write ${filePath}`)
            }

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
                const initial = statement.match(/["'](.+)["']/)[1];

                const replacement = await getReplacementUrl(initial);

                // console.log(url, replacement);

                return contents.replace(
                    statement,
                    statement.replace(
                        initial,
                        replacement
                    )
                );

                async function getReplacementUrl(url: string): Promise<string> {
                    const initial = url;

                    let importMapReplacement = importMap.imports[url];

                    if (!importMapReplacement && url.startsWith("#")) {
                        const packageImport = await getPackageImport(url);
                        if (packageImport) {
                            importMapReplacement = packageImport;
                        }
                    }

                    if (!importMapReplacement) {
                        const resolved = await externalResolve(url);
                        if (resolved) {
                            importMapReplacement = resolved;
                        }
                    }

                    if (!importMapReplacement && (url.startsWith("node:") || url.startsWith("#"))) {
                        return url;
                    }

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
                        if (importMapReplacement.startsWith("./")) {
                            const shared = getSharedParentPath(paths.directory, dirname(importMapReplacement));

                            const shift = filePath
                                .replace(`${shared.replace(/^\.\//, "")}/`, "")
                                .split("/")
                                .map(() => "..");

                            if (shared) {
                                url = importMapReplacement.slice(shared.length).substring(1);
                                const srcShift = shift.slice(1);
                                if (srcShift.length) {
                                    url = `${srcShift.join("/")}/${url}`
                                } else {
                                    url = `./${url}`;
                                }

                            } else {
                                url = importMapReplacement
                                    .replace(/^\.\//, "")
                                url = `${shift.join("/")}/${url}`;
                            }

                            // console.log({ shared, url })
                        } else {
                            url = importMapReplacement;
                        }
                    }
                    const replacement = await getResolvedStatUrl(url);
                    if (replacement === initial) return replacement;
                    // Allow another loop to continue resolution if
                    // there is more replacement that could happen
                    return getReplacementUrl(replacement);

                    async function externalResolve(id: string) {

                        for (const fn of getResolves()) {
                            const maybe = fn(
                                id,
                                undefined,
                                {
                                    isEntry: filePath === paths.entrypoint,
                                    // TODO Not yet resolved, but should be
                                    assertions: {},
                                    custom: {}
                                }
                            );
                            let value: string;
                            if (isPromise(maybe)) {
                                value = getStringId(await maybe);
                            } else {
                                value = getStringId(maybe);
                            }
                            if (value && value !== id) {
                                return value;
                            }
                        }


                        function getStringId(value: MaybeResolved): string {
                            if (!value) return undefined;
                            if (typeof value === "string") return value;
                            return value.id;
                        }

                        function getResolves(): ResolveFn[] {
                            if (!externalResolves) return [];
                            if (Array.isArray(externalResolves)) {
                                return externalResolves;
                            }
                            return [externalResolves];
                        }

                    }
                }

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

            async function getPackageImport(url: string): Promise<string> {
                interface Package {
                    imports: Record<string, string>
                }

                let packageDirectory = dirname(filePath);

                ok(url.startsWith("#"));

                let match;
                do {
                    match = await getPackageMatch(packageDirectory);
                    if (!match) {
                        if (packageDirectory === cwd) {
                            return undefined;
                        }
                        packageDirectory = dirname(packageDirectory);
                    }
                } while (!match);

                return match;

                async function getPackageMatch(dir: string) {
                    const { imports } = await getPackage(dir);

                    if (!imports) return undefined;

                    for (const key in imports) {
                        const match = getMatch(key);
                        if (match) {
                            return match;
                        }
                    }

                    function getMatch(key: string) {
                        if (!key.startsWith("#")) return undefined; // ??
                        if (key === url) {
                            return imports[key];
                        }
                        if (!key.includes("*")) {
                            return undefined;
                        }

                        const keySplit = key.split("*");

                        ok(keySplit.length === 2, "Expected one * in import");

                        const [prefix, suffix] = keySplit;

                        ok(prefix, "Expected prefix for import, at least #");

                        if (!url.startsWith(prefix)) {
                            return undefined;
                        }
                        if (suffix && !url.endsWith(suffix)) {
                            return undefined;
                        }
                        const value = imports[key];

                        if (!value.includes("*")) {
                            return value;
                        }

                        let wildcard = url.substring(prefix.length);
                        if (suffix) {
                            wildcard = url.substring(0, -suffix.length)
                        }

                        return value.replaceAll("*", wildcard);
                    }
                }

                async function getPackage(dir: string): Promise<Package> {
                    const path = `${dir}/package.json`
                    if (!await isFile(path)) {
                        if (dir === cwd) {
                            return { imports: {} }
                        }
                        return getPackage(
                            // Jump to parent dir
                            dirname(dir)
                        );
                    }
                    const file = await readFile(path, "utf-8");
                    return JSON.parse(file);
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

function getSharedParentPath(pathA: string, pathB: string) {
    const splitA = pathA.split("/");
    const splitB = pathB.split("/");
    let shared;
    do {
        const nextA = splitA.shift();
        const nextB = splitB.shift();
        if (nextA === nextB) {
            if (shared) {
                shared = `${shared}/${nextA}`;
            } else {
                shared = nextA;
            }
        }
    } while (splitA.length && splitB.length);
    return shared || pathA;
}

