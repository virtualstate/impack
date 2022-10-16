# `@virtualstate/impack`

ESM Tree Importer

[//]: # (badges)

### Support

 ![Node.js supported](https://img.shields.io/badge/node-%3E%3D18.7.0-blue)

[//]: # (badges)

# Usage

The below command will re-write all import & export urls so that they are 
fully resolved.

```shell
npx @virtualstate/impack esnext
```

This command will take

```javascript
import { run } from "./path/to";
```

If `./path/to` exists, the import is kept as is

If `./path/to.js` exists, the import will be re-written as:

```javascript
import { run } from "./path/to.js";
```

If `./path/to/index.js` exists, the import will be re-written as:

```javascript
import { run } from "./path/to/index.js";
```

## [Import maps](https://github.com/WICG/import-maps)

The below command will output an import map with all files in the folder & dependencies

```shell
# 
npx @virtualstate/impack import-map.json esnext
```

For example giving the import map of:

```json
{
  "imports": {
    "@virtualstate/promise": "./node_modules/@virtualstate/promise/esnext/index.js"
  }
}
```

Along with re-writing all import urls, you will get the output:

```json
{
  "imports": {
    "@virtualstate/promise": "esnext/@virtualstate/promise/esnext/index.js",
    "esnext/path/to/inner.js": "esnext/path/to/inner.js",
    "esnext/path/to/index.js": "esnext/path/to/index.js"
  }
}
```

The below command will output an import map with only the dependent files of this entrypoint file

```shell
# 
npx @virtualstate/impack import-map.json esnext/tests/index.js
```

Any dependency urls that are not provided in the initial import map, are not replaced. 

## [Node subpath patterns](https://nodejs.org/api/packages.html#subpath-imports)

If you were to have an import that used a node subpath pattern, starting with 
`#`, if a replacement is not found in the provided import map, the closest 
package.json with a matching pattern will be used. 

For example if your `package.json` 

```json
{
  "imports": {
    "#internal/*.js": "./src/internal/*.js"
  }
}
```

And used the import: 

```javascript
import Users from "#internal/users";
import Storage from "#internal/storage";
```

You would get the output:

```json
{
  "imports": {
    "src/index.js": "src/index.js",
    "src/internal/users.js": "src/internal/users.js",
    "src/internal/storage.js": "src/internal/storage.js"
  }
}
```

## [Cap'n Proto](https://capnproto.org/)

The below command will output modules ready to use in a capnp file

```shell
npx @virtualstate/impack import-map.json esnext --capnp
```

For Example:

```capnp
modules = [
  (name = "esnext/@virtualstate/promise/esnext/index.js", esModule = embed "esnext/@virtualstate/promise/esnext/index.js"),
  (name = "esnext/path/to/inner.js", esModule = embed "esnext/path/to/inner.js"),
  (name = "esnext/path/to/index.js", esModule = embed "esnext/path/to/index.js")
]
```

```shell
# Will replace the modules of workers in a capnp template file
npx @virtualstate/impack import-map.json esnext --capnp=workerd-template.capnp
```

For example the below template:

```capnp
const test :Workerd.Worker = (
   modules = [],
   compatibilityDate = "2022-09-16",
);
```

Will output as:

```capnp
const test :Workerd.Worker = (
   modules = [
      (name = "esnext/@virtualstate/promise/esnext/index.js", esModule = embed "esnext/@virtualstate/promise/esnext/index.js"),
      (name = "esnext/path/to/inner.js", esModule = embed "esnext/path/to/inner.js"),
      (name = "esnext/path/to/index.js", esModule = embed "esnext/path/to/index.js")
   ],
   compatibilityDate = "2022-09-16",
);
```