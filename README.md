# `@virtualstate/impack`

ESM Tree Importer

[//]: # (badges)

### Support

 ![Node.js supported](https://img.shields.io/badge/node-%3E%3D18.7.0-blue)

[//]: # (badges)

# Usage

```shell
# Will output an import map with all files in the folder & dependencies
npx @virtualstate/impack import-map.json esnext

# Will output an import map with only the dependent files of this entrypoint file
npx @virtualstate/impack import-map.json esnext/tests/index.js

# Will output modules ready to use in a capnp file
npx @virtualstate/impack import-map.json esnext --capnp

# Will replace the modules of workers in a capnp template file
npx @virtualstate/impack import-map.json esnext --capnp=workerd-template.capnp
```