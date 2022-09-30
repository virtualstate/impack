import { anAsyncThing } from "@virtualstate/promise/the-thing";
import { all, union } from "@virtualstate/promise";

const asyncThing =  anAsyncThing({
    async *[Symbol.asyncIterator]() {
        yield 1;
        yield 2;
    }
});
for await (const thing of asyncThing) {
    console.log({ thing });
}

console.log({ await: await asyncThing });

for await (const [a, b] of union([asyncThing, asyncThing])) {
    console.log({ a, b });
}

console.log({ await: await anAsyncThing(
    union([
        asyncThing,
        asyncThing
    ])
)})