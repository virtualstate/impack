# `@virtualstate/impack`

ESM Tree Importer

[//]: # (badges)

### Support

 ![Node.js supported](https://img.shields.io/badge/node-%3E%3D18.7.0-blue)

[//]: # (badges)

# Usage

## [Import maps](https://github.com/WICG/import-maps)

The below command will output an import map with all files in the folder & dependencies

```shell
# 
npx @virtualstate/impack import-map.json esnext
```

For example:

```json
{
  "imports": {
    "esnext/impack/index.js": "esnext/impack/index.js",
    "esnext/tests/index.js": "esnext/tests/index.js"
  }
}
```

The below command will output an import map with only the dependent files of this entrypoint file

```shell
# 
npx @virtualstate/impack import-map.json esnext/tests/index.js
```

Any dependency urls that are not provided in the initial import map, are not replaced. 

## [Cap'n Proto](https://capnproto.org/)

The below command will output modules ready to use in a capnp file

```shell
npx @virtualstate/impack import-map.json esnext --capnp
```

For Example:

```capnp
modules = [
  (name = "esnext/impack/index.js", esModule = embed "esnext/impack/index.js"),
  (name = "esnext/tests/index.js", esModule = embed "esnext/tests/index.js")
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
      (name = "esnext/impack/index.js", esModule = embed "esnext/impack/index.js"),
      (name = "esnext/tests/index.js", esModule = embed "esnext/tests/index.js")
   ],
   compatibilityDate = "2022-09-16",
);
```